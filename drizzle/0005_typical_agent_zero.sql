CREATE TABLE `job_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`created_at` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_email` text DEFAULT '' NOT NULL,
	`actor_name` text DEFAULT '' NOT NULL,
	`reason` text,
	`before_value` text,
	`after_value` text NOT NULL
);
