CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `member_credentials` (
	`email` text PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `members` (`email`, `display_name`, `role`, `active`) VALUES ('melvinbrown1996@gmail.com', 'Melvin', 'manager', true)
ON CONFLICT(`email`) DO UPDATE SET `display_name` = 'Melvin', `role` = 'manager', `active` = true;
--> statement-breakpoint
INSERT INTO `member_credentials` (`email`, `pin_hash`, `created_at`) VALUES ('melvinbrown1996@gmail.com', '780fe68d2422b4b3af6fb163da06e566:f0998f3d6841538112a31d8f8a6e3cd2ca08e30d8358f24f65e43830e4359459', '2026-08-15T20:55:00.000Z');
