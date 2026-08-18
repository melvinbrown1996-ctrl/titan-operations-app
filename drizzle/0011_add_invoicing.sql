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
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`check_number` text NOT NULL,
	`amount` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by_email` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`job_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_jobs_job_id_unique` ON `invoice_jobs` (`job_id`);
