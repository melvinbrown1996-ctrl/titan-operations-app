-- ==== 0000_lucky_warstar.sql ====
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`completed_at` text NOT NULL,
	`stock_or_vin` text NOT NULL,
	`vehicle` text DEFAULT '' NOT NULL,
	`service` text NOT NULL,
	`base_amount` integer NOT NULL,
	`add_on_amount` integer NOT NULL,
	`archive_url` text
);

CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);

CREATE UNIQUE INDEX `locations_name_unique` ON `locations` (`name`);
-- ==== 0001_shocking_hannibal_king.sql ====
ALTER TABLE `jobs` ADD `purchase_order_number` text;
ALTER TABLE `jobs` ADD `purchase_order_url` text;
-- ==== 0002_absurd_true_believers.sql ====
ALTER TABLE `jobs` ADD `repair_order_number` text;
-- ==== 0003_lyrical_forge.sql ====
ALTER TABLE `jobs` ADD `technician_name` text DEFAULT '' NOT NULL;
-- ==== 0004_fantastic_speedball.sql ====
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);

-- ==== 0005_typical_agent_zero.sql ====
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

-- ==== 0006_sweet_beyonder.sql ====
ALTER TABLE `jobs` ADD `damage_notes` text DEFAULT '' NOT NULL;
-- ==== 0007_thankful_violations.sql ====
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);
CREATE TABLE `member_credentials` (
	`email` text PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`created_at` text NOT NULL
);

INSERT INTO `members` (`email`, `display_name`, `role`, `active`) VALUES ('melvinbrown1996@gmail.com', 'Melvin', 'manager', true)
ON CONFLICT(`email`) DO UPDATE SET `display_name` = 'Melvin', `role` = 'manager', `active` = true;

INSERT INTO `member_credentials` (`email`, `pin_hash`, `created_at`) VALUES ('melvinbrown1996@gmail.com', '780fe68d2422b4b3af6fb163da06e566:f0998f3d6841538112a31d8f8a6e3cd2ca08e30d8358f24f65e43830e4359459', '2026-08-15T20:55:00.000Z');

-- ==== 0008_reset_manager_pin_hash.sql ====
UPDATE `member_credentials`
SET `pin_hash` = '780fe68d2422b4b3af6fb163da06e566:5d93a70d4809cc8647e3df5d493a3099cdd323cc486cbebe6c01d429a2489f43'
WHERE `email` = 'melvinbrown1996@gmail.com';

-- ==== 0009_restore_melvin_manager.sql ====
UPDATE `members`
SET `role` = 'manager', `active` = true
WHERE `email` = 'melvinbrown1996@gmail.com';

-- ==== 0010_legal_sunfire.sql ====
CREATE TABLE `po_verification_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`source_line` text NOT NULL,
	`source_identifier` text NOT NULL,
	`purchase_order_number` text NOT NULL,
	`repair_order_number` text,
	`matched_job_id` text,
	`candidate_job_ids` text DEFAULT '[]' NOT NULL,
	`match_method` text NOT NULL,
	`status` text NOT NULL,
	`entered_by_email` text DEFAULT '' NOT NULL,
	`reviewed_at` text
);

-- ==== 0011_add_invoicing.sql ====
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` text NOT NULL,
	`created_by_email` text DEFAULT '' NOT NULL,
	`payment_id` text
);

CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`check_number` text NOT NULL,
	`amount` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by_email` text DEFAULT '' NOT NULL
);

CREATE TABLE `invoice_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`job_id` text NOT NULL
);

CREATE UNIQUE INDEX `invoice_jobs_job_id_unique` ON `invoice_jobs` (`job_id`);

