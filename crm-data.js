/* Package ledger and attendance upgrade. All records remain in Supabase. */
var CRM_ATTENDANCE_LABELS={attended:'Attended',cancelled:'Cancelled',late_cancel:'Late cancellation',no_show:'No-show'};
var CRM_RENEWAL_LABELS={not_contacted:'To contact',contacted:'Contacted',interested:'Interested',renewed:'Package added',deferred:'Deferred'};
var crmQueryError=null;
function crmToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function crmTime(){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}
function crmError(e){var msg=String(e&&e.message||e||'Unable to connect');if(/duplicate key/.test(msg))return 'Attendance already exists for that client at this time. Check the history before trying again.';return msg;}
function crmReportError(e){crmQueryError=crmError(e);window.dispatchEvent(new Event('crm-error'));}
function crmRPCRow(data){var row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('No updated record was returned. Refresh the page before retrying.');return row;}
function crmPackageRow(p){return {id:p.id,trainerId:p.trainer_id,clientId:p.client_id,name:p.name,purchased:p.purchased,openingConsumed:p.opening_consumed,startDate:p.start_date,expiryDate:p.expiry_date,source:p.source,archived:p.archived,revision:p.revision,createdAt:p.created_at,updatedAt:p.updated_at};}
function crmPackageToRow(p){return {id:p.id,client_id:p.clientId,name:p.name,purchased:Number(p.purchased),opening_consumed:Number(p.openingConsumed||0),start_date:p.startDate||null,expiry_date:p.expiryDate||null,archived:!!p.archived};}
function crmPackageUsed(p,sessions){return p.openingConsumed+(sessions||[]).filter(function(s){return s.packageId===p.id&&s.chargeSession!==false&&!s.voidedAt;}).length;}
function crmPackageBalance(p,sessions){return p.purchased-crmPackageUsed(p,sessions);}
function crmCompleted(s){return !s.voidedAt&&(s.attendanceStatus||'attended')==='attended'&&s.date<=crmToday();}
var crmOriginalClientMapper=rowToClient;
rowToClient=function(r){var c=crmOriginalClientMapper(r);if(c){c.preferredSchedule=r.preferred_schedule||'';c.renewalStatus=r.renewal_status||'not_contacted';c.expectedRenewal=Number(r.expected_renewal||0);}return c;};
var crmOriginalClientToRow=clientToRow;
clientToRow=function(c){var row=crmOriginalClientToRow(c);if('preferredSchedule'in c)row.preferred_schedule=c.preferredSchedule||'';if('renewalStatus'in c)row.renewal_status=c.renewalStatus;if('expectedRenewal'in c)row.expected_renewal=Number(c.expectedRenewal||0);return row;};
var crmOriginalSessionMapper=rowToSession;
rowToSession=function(r){var s=crmOriginalSessionMapper(r);if(s){s.packageId=r.package_id||null;s.attendanceStatus=r.attendance_status||'attended';s.chargeSession=r.charge_session!==false;s.sessionTime=r.session_time||null;s.voidedAt=r.voided_at||null;s.revision=r.revision||0;}return s;};
var crmOriginalSessionToRow=sessionToRow;
sessionToRow=function(s){var row=crmOriginalSessionToRow(s);if('packageId'in s)row.package_id=s.packageId||null;if('attendanceStatus'in s)row.attendance_status=s.attendanceStatus;if('chargeSession'in s)row.charge_session=!!s.chargeSession;if('sessionTime'in s)row.session_time=s.sessionTime||null;if('voidedAt'in s)row.voided_at=s.voidedAt||null;if('revision'in s)row.revision=s.revision;return row;};
var packageRepository={
 list:function(clientId){var q=supabaseClient.from('client_packages').select('*').order('created_at',{ascending:true});if(clientId)q=q.eq('client_id',clientId);return q.then(checkError).then(function(rows){return rows.map(crmPackageRow);});},
 save:function(p){var row=crmPackageToRow(p);if(p.revision!=null)return supabaseClient.rpc('crm_update_package',{p_id:p.id,p_revision:p.revision,p_values:row}).then(checkError).then(crmRPCRow).then(crmPackageRow).then(afterWrite);return supabaseClient.from('client_packages').insert(row).select().single().then(checkError).then(crmPackageRow).then(afterWrite);}
};
var crmOriginalClientList=clientRepository.list;
clientRepository.list=function(filter){return Promise.all([crmOriginalClientList(filter),packageRepository.list()]).then(function(r){return r[0].map(function(c){c.crmPackages=r[1].filter(function(p){return p.clientId===c.id;});return c;});});};
var crmOriginalClientGet=clientRepository.get;
clientRepository.get=function(id){if(!id)return Promise.resolve(undefined);return Promise.all([crmOriginalClientGet(id),packageRepository.list(id)]).then(function(r){if(r[0])r[0].crmPackages=r[1];return r[0];});};
var crmOriginalStats=computeSessionStats;
computeSessionStats=function(client,sessions){
 var valid=(sessions||[]).filter(crmCompleted),base=crmOriginalStats(client,valid);if(!client.crmPackages)return base;
 var packs=client.crmPackages.filter(function(p){return !p.archived;});if(!packs.length){base.total=null;base.remaining=null;base.packageStatus='no-package';base.availableRemaining=0;base.purchased=0;base.packageConsumed=0;return base;}
 var purchased=packs.reduce(function(n,p){return n+p.purchased;},0),consumed=packs.reduce(function(n,p){return n+crmPackageUsed(p,sessions);},0),remaining=purchased-consumed;
 var available=packs.filter(function(p){return !p.expiryDate||p.expiryDate>=crmToday();}).reduce(function(n,p){return n+Math.max(0,crmPackageBalance(p,sessions));},0);
 var state=remaining<=0?'completed':available<=0?'expired':packs.some(function(p){return crmPackageBalance(p,sessions)>0&&p.expiryDate&&p.expiryDate>=crmToday()&&p.expiryDate<=addDaysIso(crmToday(),14);})?'expiring-soon':'active';
 return Object.assign(base,{remaining:remaining,total:purchased,purchased:purchased,packageConsumed:consumed,consumedInCurrentPackage:consumed,availableRemaining:available,packageStatus:state});
};
function crmNeedsRenewal(c,sessions){if(c.status!=='active'||c.renewalStatus==='deferred')return false;var s=computeSessionStats(c,(sessions||[]).filter(function(v){return v.clientId===c.id;}));return s.total!=null&&(s.availableRemaining<=3||['expired','expiring-soon','completed'].indexOf(s.packageStatus)!==-1);}
function crmRenewalList(clients,sessions){return (clients||[]).filter(function(c){return crmNeedsRenewal(c,sessions);}).sort(function(a,b){return computeSessionStats(a,sessions.filter(function(s){return s.clientId===a.id;})).availableRemaining-computeSessionStats(b,sessions.filter(function(s){return s.clientId===b.id;})).availableRemaining;});}
var crmOriginalSessionUpdate=sessionRepository.update;
sessionRepository.update=function(id,patch){return sessionRepository.get(id).then(function(current){if(!current)throw new Error('Session not found');if(patch.revision!=null&&patch.revision!==current.revision)throw new Error('Session changed on another device. Reopen the form.');return supabaseClient.rpc('crm_update_session',{p_id:id,p_revision:patch.revision!=null?patch.revision:current.revision,p_values:sessionToRow(Object.assign({},current,patch))}).then(checkError).then(crmRPCRow).then(rowToSession).then(afterWrite);});};
sessionRepository.void=function(s){return supabaseClient.rpc('crm_void_attendance',{p_id:s.id,p_revision:s.revision||0}).then(checkError).then(crmRPCRow).then(rowToSession).then(afterWrite);};
sessionRepository.remove=function(id){return sessionRepository.get(id).then(function(s){if(!s)throw new Error('Session not found');return sessionRepository.void(s);});};
var crmOriginalToday=todayIso;
todayIso=crmToday;
localTodayIso=crmToday;

function crmValidateBackup(b){
 if(!b||b.app!=='client-session-tracker'||!Array.isArray(b.clients)||!Array.isArray(b.sessions)||!Array.isArray(b.goals))throw new Error('This is not a Client Session Tracker backup.');
 var collections=['clients','sessions','goals','programs','packages','bodyScores','movementScreens','scheduledWorkouts'];
 collections.forEach(function(k){if(k in b&&!Array.isArray(b[k]))throw new Error('Invalid backup collection: '+k);if(b[k]){var ids=new Set();b[k].forEach(function(v){if(!v||typeof v.id!=='string'||ids.has(v.id))throw new Error('Missing or duplicate record ID in '+k);ids.add(v.id);});}});
 return b;
}
function crmRawToModelBackup(b){if(b.clients.some(function(c){return 'full_name'in c;}))return Object.assign({},b,{clients:b.clients.map(rowToClient),sessions:b.sessions.map(rowToSession),goals:b.goals.map(rowToGoal),programs:(b.programs||[]).map(rowToProgram),...(b.client_packages?{packages:b.client_packages.map(crmPackageRow)}:{}),bodyScores:(b.body_scores||[]).map(rowToBodyScore),movementScreens:(b.movement_screens||[]).map(rowToMovementScreen),scheduledWorkouts:(b.scheduled_workouts||[]).map(rowToScheduled)});return b;}
function crmWithDates(fn){return function(v){var r=fn(v);if(v.createdAt)r.created_at=v.createdAt;if(v.updatedAt)r.updated_at=v.updatedAt;return r;};}
function crmBackupRows(b){b=crmValidateBackup(crmRawToModelBackup(b));var out={clients:b.clients.map(crmWithDates(clientToRow)),sessions:b.sessions.map(crmWithDates(sessionToRow)),goals:b.goals.map(crmWithDates(goalToRow)),programs:(b.programs||[]).map(crmWithDates(programToRow))};if(Number(b.schemaVersion||0)<4)out.sessions=out.sessions.map(function(row){['package_id','attendance_status','charge_session','session_time','voided_at','revision'].forEach(function(k){delete row[k];});return row;});if(b.packages)out.client_packages=b.packages.map(function(p){return Object.assign(crmPackageToRow(p),{source:p.source||'manual',revision:p.revision||0,created_at:p.createdAt||nowIso(),updated_at:p.updatedAt||nowIso()});});if(b.bodyScores)out.body_scores=b.bodyScores.map(crmWithDates(bodyScoreToRow));if(b.movementScreens)out.movement_screens=b.movementScreens.map(crmWithDates(movementScreenToRow));if(b.scheduledWorkouts)out.scheduled_workouts=b.scheduledWorkouts.map(crmWithDates(scheduledToRow));return out;}
exportBackup=function(){return Promise.all([clientRepository.list(),sessionRepository.listAll(),goalRepository.listAll(),programRepository.list(),packageRepository.list(),supabaseClient.from('body_scores').select('*').then(checkError),supabaseClient.from('movement_screens').select('*').then(checkError),supabaseClient.from('scheduled_workouts').select('*').then(checkError)]).then(function(r){return {app:'client-session-tracker',schemaVersion:4,exportedAt:nowIso(),clients:r[0].map(function(c){var copy=Object.assign({},c);delete copy.crmPackages;return copy;}),sessions:r[1],goals:r[2],programs:r[3],packages:r[4],bodyScores:r[5].map(rowToBodyScore),movementScreens:r[6].map(rowToMovementScreen),scheduledWorkouts:r[7].map(rowToScheduled)};});};
restoreBackup=function(backup,mode){var rows;try{rows=crmBackupRows(backup);}catch(e){return Promise.reject(e);}return supabaseClient.rpc('crm_restore_backup',{p_data:rows,p_mode:mode||'merge'}).then(checkError).then(afterWrite);};

var crmOriginalClientUpdate=clientRepository.update;
clientRepository.update=function(id,patch){if(!patch._expectedUpdatedAt)return crmOriginalClientUpdate(id,patch);return supabaseClient.from('clients').update(clientToRow(patch)).eq('id',id).eq('updated_at',patch._expectedUpdatedAt).select().maybeSingle().then(checkError).then(function(row){if(!row)throw new Error('Client profile changed on another device. Reopen the profile before editing.');return afterWrite(rowToClient(row));});};
