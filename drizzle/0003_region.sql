ALTER TABLE `profiles` ADD `region_mode` text DEFAULT 'real' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `region_timezone` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `region_locale` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `region_latitude` real;--> statement-breakpoint
ALTER TABLE `profiles` ADD `region_longitude` real;--> statement-breakpoint
ALTER TABLE `profiles` ADD `region_accuracy` integer;--> statement-breakpoint
ALTER TABLE `proxies` ADD `last_timezone` text;--> statement-breakpoint
ALTER TABLE `proxies` ADD `last_latitude` real;--> statement-breakpoint
ALTER TABLE `proxies` ADD `last_longitude` real;