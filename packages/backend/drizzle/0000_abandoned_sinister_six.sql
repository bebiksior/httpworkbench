CREATE TABLE `instanceModerations` (
	`instanceId` text PRIMARY KEY NOT NULL,
	`window5mStartMs` integer NOT NULL,
	`requestsInWindow5m` integer NOT NULL,
	`strikeCommittedForWindow` integer NOT NULL,
	`strikeTimestampsJson` text NOT NULL,
	`discordMutedUntilMs` integer,
	`window15mStartMs` integer NOT NULL,
	`requestsInWindow15m` integer NOT NULL,
	`lastMinuteBucketStartMs` integer NOT NULL,
	`requestsInCurrentMinute` integer NOT NULL,
	FOREIGN KEY (`instanceId`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `instanceWebhooks` (
	`instanceId` text NOT NULL,
	`webhookId` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`instanceId`, `position`),
	FOREIGN KEY (`instanceId`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`webhookId`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instanceWebhooks_instance_webhook_unique` ON `instanceWebhooks` (`instanceId`,`webhookId`);--> statement-breakpoint
CREATE INDEX `instanceWebhooks_by_instance` ON `instanceWebhooks` (`instanceId`,`position`);--> statement-breakpoint
CREATE TABLE `instances` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer,
	`label` text,
	`isPublic` integer NOT NULL,
	`isLocked` integer NOT NULL,
	`kind` text NOT NULL,
	`raw` text,
	`processorsJson` text
);
--> statement-breakpoint
CREATE INDEX `instances_by_owner` ON `instances` (`ownerId`);--> statement-breakpoint
CREATE INDEX `instances_by_expiration` ON `instances` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `logs` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`instanceId` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`address` text NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`instanceId`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logs_id_unique` ON `logs` (`id`);--> statement-breakpoint
CREATE INDEX `logs_by_instance_timestamp_id` ON `logs` (`instanceId`,`timestamp`,`id`);--> statement-breakpoint
CREATE INDEX `logs_by_instance_seq` ON `logs` (`instanceId`,`seq`);--> statement-breakpoint
CREATE TABLE `userNotices` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`instanceId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`acknowledgedAt` integer
);
--> statement-breakpoint
CREATE INDEX `userNotices_by_user_createdAt` ON `userNotices` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`googleId` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_googleId_unique` ON `users` (`googleId`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`ownerId` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhooks_by_owner` ON `webhooks` (`ownerId`);