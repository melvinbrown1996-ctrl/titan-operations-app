CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
