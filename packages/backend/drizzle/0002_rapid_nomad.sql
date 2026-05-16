CREATE TABLE `apiKeys` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`secretHash` text NOT NULL,
	`scopesJson` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer,
	`expiresAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apiKeys_prefix_unique` ON `apiKeys` (`prefix`);--> statement-breakpoint
CREATE INDEX `apiKeys_by_user_createdAt` ON `apiKeys` (`userId`,`createdAt`);
