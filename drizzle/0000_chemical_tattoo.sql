CREATE TABLE `coach_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`encrypted_session` text NOT NULL,
	`expires_at` integer NOT NULL,
	`refresh_lock_until` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
