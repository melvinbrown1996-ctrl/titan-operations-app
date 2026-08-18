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
