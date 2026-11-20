CREATE TABLE `proxies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text,
	`password_enc` text,
	`change_ip_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_check_at` integer,
	`last_check_ok` integer,
	`last_ip` text,
	`last_country` text,
	`last_region` text,
	`last_city` text,
	`last_latency_ms` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `proxies_name_idx` ON `proxies` (`name`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `proxy_id` text REFERENCES proxies(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `profiles_proxy_idx` ON `profiles` (`proxy_id`);