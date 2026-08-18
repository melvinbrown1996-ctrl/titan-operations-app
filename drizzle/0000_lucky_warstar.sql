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
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_name_unique` ON `locations` (`name`);