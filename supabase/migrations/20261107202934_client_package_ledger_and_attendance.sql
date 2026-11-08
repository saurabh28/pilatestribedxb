-- Additive upgrade. Original client, session, screening and calendar rows are retained.
ALTER TABLE public.clients
  ADD COLUMN preferred_schedule text NOT NULL DEFAULT '',
  ADD COLUMN renewal_status text NOT NULL DEFAULT 'not_contacted' CHECK (renewal_status IN ('not_contacted','contacted','interested','renewed','deferred')),
  ADD COLUMN expected_renewal numeric(12,2) NOT NULL DEFAULT 0 CHECK (expected_renewal >= 0);

CREATE TABLE public.client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Private sessions' CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  purchased integer NOT NULL CHECK (purchased BETWEEN 1 AND 10000),
  opening_consumed integer NOT NULL DEFAULT 0 CHECK (opening_consumed >= 0 AND opening_consumed <= purchased),
  start_date date,
  expiry_date date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','legacy')),
  archived boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR start_date IS NULL OR expiry_date >= start_date)
);
CREATE INDEX client_packages_owner_client_idx ON public.client_packages(trainer_id,client_id);
CREATE UNIQUE INDEX client_packages_one_legacy_idx ON public.client_packages(client_id) WHERE source = 'legacy';
ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY packages_owner_all ON public.client_packages FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = trainer_id) WITH CHECK ((SELECT auth.uid()) = trainer_id);
REVOKE ALL ON public.client_packages FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.client_packages TO authenticated;

ALTER TABLE public.sessions
  ADD COLUMN package_id uuid REFERENCES public.client_packages(id) ON DELETE RESTRICT,
  ADD COLUMN attendance_status text NOT NULL DEFAULT 'attended' CHECK (attendance_status IN ('attended','cancelled','late_cancel','no_show')),
  ADD COLUMN charge_session boolean NOT NULL DEFAULT true,
  ADD COLUMN session_time time,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE INDEX sessions_package_idx ON public.sessions(package_id);
CREATE UNIQUE INDEX sessions_unique_attendance_time ON public.sessions(trainer_id,client_id,date,session_time)
  WHERE voided_at IS NULL AND session_time IS NOT NULL;

-- Capture the existing package without guessing any unrecorded usage.
INSERT INTO public.client_packages(trainer_id,client_id,name,purchased,start_date,expiry_date,source)
SELECT trainer_id,id,'Existing package',package_total_sessions,package_start_date,package_expiry_date,'legacy'
FROM public.clients WHERE package_total_sessions > 0;
UPDATE public.sessions s SET package_id = p.id
FROM public.client_packages p WHERE p.source='legacy' AND p.client_id=s.client_id
  AND p.trainer_id=s.trainer_id AND (p.start_date IS NULL OR s.date >= p.start_date);

CREATE FUNCTION public.crm_package_remaining(p_id uuid,p_exclude uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT p.purchased-p.opening_consumed-(SELECT count(*)::integer FROM public.sessions s
  WHERE s.package_id=p.id AND s.charge_session AND s.voided_at IS NULL AND (p_exclude IS NULL OR s.id<>p_exclude))
 FROM public.client_packages p WHERE p.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.crm_package_remaining(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_package_remaining(uuid,uuid) TO authenticated;

CREATE FUNCTION public.crm_guard_package() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.clients; n integer; first_date date;
BEGIN
 SELECT * INTO c FROM public.clients WHERE id=NEW.client_id FOR UPDATE;
 IF NOT FOUND OR c.trainer_id<>NEW.trainer_id OR (auth.uid() IS NOT NULL AND NEW.trainer_id<>auth.uid()) THEN
  RAISE EXCEPTION 'Client is not available to this account';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.client_id<>OLD.client_id OR NEW.trainer_id<>OLD.trainer_id) THEN
  RAISE EXCEPTION 'Package ownership cannot be changed';
 END IF;
 SELECT count(*)::integer,min(date) FILTER (WHERE attendance_status='attended') INTO n,first_date FROM public.sessions
 WHERE package_id=NEW.id AND charge_session AND voided_at IS NULL;
 IF NEW.purchased<NEW.opening_consumed+n THEN RAISE EXCEPTION 'Purchased sessions cannot be below consumed sessions'; END IF;
 IF NEW.opening_consumed>0 AND NEW.start_date IS NULL THEN RAISE EXCEPTION 'Enter the start date for a package already in use'; END IF;
 IF first_date IS NOT NULL AND (NEW.start_date IS NULL OR NEW.start_date>first_date) THEN RAISE EXCEPTION 'Start date must include the recorded sessions'; END IF;
 IF NEW.start_date>(now() AT TIME ZONE 'Asia/Dubai')::date THEN RAISE EXCEPTION 'Leave advance packages unstarted'; END IF;
 NEW.updated_at=now();
 IF TG_OP='UPDATE' THEN NEW.revision=OLD.revision+1; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER crm_package_guard BEFORE INSERT OR UPDATE ON public.client_packages FOR EACH ROW EXECUTE FUNCTION public.crm_guard_package();

CREATE FUNCTION public.crm_guard_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.clients; p public.client_packages; chosen uuid; needs_charge boolean; restore_mode boolean;
BEGIN
 SELECT * INTO c FROM public.clients WHERE id=NEW.client_id FOR UPDATE;
 IF NOT FOUND OR c.trainer_id<>NEW.trainer_id OR (auth.uid() IS NOT NULL AND NEW.trainer_id<>auth.uid()) THEN
  RAISE EXCEPTION 'Client is not available to this account';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.client_id<>OLD.client_id OR NEW.trainer_id<>OLD.trainer_id) THEN RAISE EXCEPTION 'Session ownership cannot be changed'; END IF;
 restore_mode=coalesce(current_setting('crm.restore_mode',true),'')='on';
 IF restore_mode THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL THEN RAISE EXCEPTION 'Undone attendance cannot be reactivated; record a new entry'; END IF;
  NEW.revision=OLD.revision+1;
  -- A note-only update of historical records must not recalculate old package allocations.
  IF (NEW.date,NEW.session_time,NEW.package_id,NEW.attendance_status,NEW.charge_session,NEW.voided_at)
    IS NOT DISTINCT FROM (OLD.date,OLD.session_time,OLD.package_id,OLD.attendance_status,OLD.charge_session,OLD.voided_at) THEN RETURN NEW; END IF;
 END IF;
 IF NEW.voided_at IS NOT NULL THEN RETURN NEW; END IF;
 IF c.status<>'active' THEN RAISE EXCEPTION 'Activate the client before recording attendance'; END IF;
 IF NEW.date>(now() AT TIME ZONE 'Asia/Dubai')::date THEN RAISE EXCEPTION 'Attendance cannot be in the future'; END IF;
 IF NEW.attendance_status='cancelled' THEN NEW.charge_session=false; END IF;
 IF NEW.attendance_status='attended' AND NOT NEW.charge_session THEN RAISE EXCEPTION 'Attended sessions must deduct one session'; END IF;
 needs_charge=NEW.charge_session;
 IF NOT needs_charge THEN NEW.package_id=NULL; RETURN NEW; END IF;
 chosen=NEW.package_id;
 IF chosen IS NULL THEN
  SELECT id INTO chosen FROM public.client_packages pp WHERE pp.client_id=NEW.client_id
   AND NOT pp.archived AND (pp.start_date IS NULL OR pp.start_date<=NEW.date)
   AND (pp.expiry_date IS NULL OR pp.expiry_date>=NEW.date)
   AND public.crm_package_remaining(pp.id,NEW.id)>0
   ORDER BY pp.start_date NULLS LAST,pp.created_at LIMIT 1;
 END IF;
 SELECT * INTO p FROM public.client_packages WHERE id=chosen AND client_id=NEW.client_id AND trainer_id=NEW.trainer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Add an available package before recording this session'; END IF;
 IF p.archived THEN RAISE EXCEPTION 'This package is archived'; END IF;
 IF p.start_date IS NOT NULL AND NEW.date<p.start_date THEN RAISE EXCEPTION 'Session is before the package start date'; END IF;
 IF p.expiry_date IS NOT NULL AND NEW.date>p.expiry_date THEN RAISE EXCEPTION 'This package has expired. Extend it or add a renewal'; END IF;
 IF public.crm_package_remaining(p.id,NEW.id)<1 THEN RAISE EXCEPTION 'This package has no sessions remaining'; END IF;
 NEW.package_id=p.id;
 IF NEW.attendance_status='attended' AND p.start_date IS NULL THEN UPDATE public.client_packages SET start_date=NEW.date WHERE id=p.id; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER crm_attendance_guard BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.crm_guard_attendance();

-- Safe cross-device updates: clients must provide the revision they read.
CREATE FUNCTION public.crm_update_package(p_id uuid,p_revision integer,p_values jsonb)
RETURNS public.client_packages LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.client_packages;
BEGIN
 UPDATE public.client_packages SET name=p_values->>'name',purchased=(p_values->>'purchased')::integer,
  opening_consumed=(p_values->>'opening_consumed')::integer,start_date=nullif(p_values->>'start_date','')::date,
  expiry_date=nullif(p_values->>'expiry_date','')::date,archived=coalesce((p_values->>'archived')::boolean,false)
 WHERE id=p_id AND revision=p_revision RETURNING * INTO p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Package changed on another device. Refresh before trying again'; END IF;
 RETURN p;
END; $$;
CREATE FUNCTION public.crm_void_attendance(p_id uuid,p_revision integer)
RETURNS public.sessions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.sessions;
BEGIN
 UPDATE public.sessions SET voided_at=now() WHERE id=p_id AND revision=p_revision AND voided_at IS NULL RETURNING * INTO s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attendance changed or has already been undone. Refresh your view'; END IF;
 RETURN s;
END; $$;
CREATE FUNCTION public.crm_update_session(p_id uuid,p_revision integer,p_values jsonb)
RETURNS public.sessions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.sessions;
BEGIN
 UPDATE public.sessions SET date=(p_values->>'date')::date,session_time=nullif(p_values->>'session_time','')::time,
  training_type=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_values->'training_type','[]'::jsonb))),
  duration_minutes=(p_values->>'duration_minutes')::integer,exercises=coalesce(p_values->'exercises','[]'::jsonb),
  session_note=coalesce(p_values->>'session_note',''),client_response=coalesce(p_values->>'client_response',''),
  pain_score=(p_values->>'pain_score')::integer,rpe=(p_values->>'rpe')::integer,
  modifications=coalesce(p_values->>'modifications',''),progression=coalesce(p_values->>'progression',''),
  homework=coalesce(p_values->>'homework',''),next_session_focus=coalesce(p_values->>'next_session_focus',''),
  program_id=nullif(p_values->>'program_id','')::uuid
 WHERE id=p_id AND revision=p_revision AND voided_at IS NULL RETURNING * INTO s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session changed on another device or was undone. Refresh before editing'; END IF;
 RETURN s;
END; $$;

-- Complete, atomic restore. Existing version-2 exports use merge mode; full
-- replacement requires every collection so absent history can never be erased.
CREATE FUNCTION public.crm_restore_backup(p_data jsonb,p_mode text DEFAULT 'merge')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t text; cols text; updates text; defs text; defaults jsonb; existing jsonb; item jsonb; cnt integer; counts jsonb='{}'::jsonb;
 tables text[]=ARRAY['programs','clients','client_packages','sessions','goals','body_scores','movement_screens','scheduled_workouts'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before restoring a backup'; END IF;
 IF p_mode NOT IN ('merge','replace') THEN RAISE EXCEPTION 'Invalid restore mode'; END IF;
 IF jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid backup'; END IF;
 FOREACH t IN ARRAY tables LOOP
  IF p_data ? t AND jsonb_typeof(p_data->t)<>'array' THEN RAISE EXCEPTION 'Invalid backup collection: %',t; END IF;
  IF p_mode='replace' AND NOT p_data ? t THEN RAISE EXCEPTION 'This older backup must be merged; a complete backup is required for replacement'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_data->t,'[]'::jsonb)) LOOP
   IF item->>'id' IS NULL THEN RAISE EXCEPTION 'A backup record has no ID'; END IF;
  END LOOP;
 END LOOP;
 PERFORM set_config('crm.restore_mode','on',true);
 IF p_mode='replace' THEN
  DELETE FROM public.scheduled_workouts WHERE trainer_id=auth.uid();
  DELETE FROM public.body_scores WHERE trainer_id=auth.uid();
  DELETE FROM public.movement_screens WHERE trainer_id=auth.uid();
  DELETE FROM public.goals WHERE trainer_id=auth.uid();
  DELETE FROM public.sessions WHERE trainer_id=auth.uid();
  DELETE FROM public.client_packages WHERE trainer_id=auth.uid();
  DELETE FROM public.clients WHERE trainer_id=auth.uid();
  DELETE FROM public.programs WHERE trainer_id=auth.uid();
 END IF;
 FOREACH t IN ARRAY tables LOOP
  SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position),
   string_agg(format('%I=EXCLUDED.%I',column_name,column_name),',' ORDER BY ordinal_position) FILTER(WHERE column_name NOT IN ('id','trainer_id'))
   INTO cols,updates FROM information_schema.columns WHERE table_schema='public' AND table_name=t;
  SELECT string_agg(format('%L,%s',column_name,coalesce(column_default,'NULL')),',') INTO defs FROM information_schema.columns WHERE table_schema='public' AND table_name=t;
  EXECUTE format('SELECT jsonb_build_object(%s)',defs) INTO defaults;
  cnt=0;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_data->t,'[]'::jsonb)) LOOP
   EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=($1->>''id'')::uuid',t) INTO existing USING item;
   item=defaults||coalesce(existing,'{}'::jsonb)||item||jsonb_build_object('trainer_id',auth.uid());
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) ON CONFLICT(id) DO UPDATE SET %s',t,cols,cols,t,updates) USING item;
   cnt=cnt+1;
  END LOOP;
  counts=counts||jsonb_build_object(t,cnt);
 END LOOP;
 INSERT INTO public.client_packages(trainer_id,client_id,name,purchased,start_date,expiry_date,source)
 SELECT trainer_id,id,'Imported existing package',package_total_sessions,package_start_date,package_expiry_date,'legacy' FROM public.clients c
 WHERE c.trainer_id=auth.uid() AND c.package_total_sessions>0 AND NOT EXISTS(SELECT 1 FROM public.client_packages p WHERE p.client_id=c.id);
 UPDATE public.sessions s SET package_id=p.id FROM public.client_packages p WHERE s.package_id IS NULL AND p.source='legacy' AND p.client_id=s.client_id
 AND p.trainer_id=auth.uid() AND s.charge_session AND NOT (p_data ? 'client_packages') AND (p.start_date IS NULL OR s.date>=p.start_date);
 IF EXISTS(SELECT 1 FROM public.client_packages p WHERE p.trainer_id=auth.uid() AND public.crm_package_remaining(p.id,NULL)<0) THEN
  RAISE EXCEPTION 'Backup contains a negative package balance; no changes were saved';
 END IF;
 PERFORM set_config('crm.restore_mode','off',true);
 RETURN counts;
END; $$;

REVOKE ALL ON FUNCTION public.crm_guard_package(),public.crm_guard_attendance(),public.crm_update_package(uuid,integer,jsonb),public.crm_void_attendance(uuid,integer),public.crm_update_session(uuid,integer,jsonb),public.crm_restore_backup(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_guard_package(),public.crm_guard_attendance(),public.crm_update_package(uuid,integer,jsonb),public.crm_void_attendance(uuid,integer),public.crm_update_session(uuid,integer,jsonb),public.crm_restore_backup(jsonb,text) TO authenticated;

-- Pin the existing timestamp helper. The internal RLS event trigger is kept
-- intact but removed from ordinary API callers' execution grants.
ALTER FUNCTION public.set_updated_at() SET search_path='';
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.crm_guard_related_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner_id uuid; ref_program uuid;
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.trainer_id<>auth.uid() THEN RAISE EXCEPTION 'Record belongs to another account'; END IF;
 IF TG_TABLE_NAME<>'clients' THEN
  SELECT trainer_id INTO owner_id FROM public.clients WHERE id=NEW.client_id;
  IF owner_id IS NULL OR owner_id<>NEW.trainer_id THEN RAISE EXCEPTION 'Client belongs to another account'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('clients','sessions','scheduled_workouts') THEN
  IF TG_TABLE_NAME='clients' THEN ref_program=NEW.assigned_program_id; ELSE ref_program=NEW.program_id; END IF;
  IF ref_program IS NOT NULL THEN
   SELECT trainer_id INTO owner_id FROM public.programs WHERE id=ref_program;
   IF owner_id IS NULL OR owner_id<>NEW.trainer_id THEN RAISE EXCEPTION 'Template belongs to another account'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME IN ('body_scores','scheduled_workouts') THEN
 IF NEW.session_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=NEW.session_id AND client_id=NEW.client_id AND trainer_id=NEW.trainer_id) THEN RAISE EXCEPTION 'Session belongs to another client or account'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.body_scores FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.movement_screens FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE TRIGGER crm_related_owner BEFORE INSERT OR UPDATE ON public.scheduled_workouts FOR EACH ROW EXECUTE FUNCTION public.crm_guard_related_owner();
CREATE FUNCTION public.crm_package_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.source='manual' AND coalesce(current_setting('crm.restore_mode',true),'')<>'on' THEN UPDATE public.clients SET renewal_status='renewed' WHERE id=NEW.client_id; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER crm_package_renewed AFTER INSERT ON public.client_packages FOR EACH ROW EXECUTE FUNCTION public.crm_package_after_insert();
CREATE FUNCTION public.crm_attendance_after_void() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN UPDATE public.scheduled_workouts SET session_id=NULL WHERE session_id=NEW.id AND trainer_id=NEW.trainer_id; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER crm_attendance_untrack AFTER UPDATE OF voided_at ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.crm_attendance_after_void();
REVOKE ALL ON FUNCTION public.crm_guard_related_owner(),public.crm_package_after_insert(),public.crm_attendance_after_void() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_guard_related_owner(),public.crm_package_after_insert(),public.crm_attendance_after_void() TO authenticated;
