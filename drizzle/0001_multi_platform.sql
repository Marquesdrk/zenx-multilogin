CREATE TABLE `profile_platforms` (
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `platform`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_platforms_platform_idx` ON `profile_platforms` (`platform`);--> statement-breakpoint
INSERT OR IGNORE INTO `profile_platforms` (`profile_id`, `platform`, `position`) SELECT `id`, `platform`, 0 FROM `profiles`;
