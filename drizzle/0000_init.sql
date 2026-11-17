CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `groups_name_idx` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `profile_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `profile_events_created_idx` ON `profile_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `profile_events_profile_idx` ON `profile_events` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profile_tags` (
	`profile_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`profile_id`, `tag_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_tags_tag_idx` ON `profile_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`username` text,
	`home_url` text,
	`group_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`data_dir` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_opened_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_data_dir_unique` ON `profiles` (`data_dir`);--> statement-breakpoint
CREATE INDEX `profiles_name_idx` ON `profiles` (`name`);--> statement-breakpoint
CREATE INDEX `profiles_username_idx` ON `profiles` (`username`);--> statement-breakpoint
CREATE INDEX `profiles_platform_idx` ON `profiles` (`platform`);--> statement-breakpoint
CREATE INDEX `profiles_group_idx` ON `profiles` (`group_id`);--> statement-breakpoint
CREATE INDEX `profiles_last_opened_idx` ON `profiles` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);