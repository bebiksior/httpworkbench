CREATE TABLE `mailMessages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`mailboxId` text NOT NULL,
	`direction` text NOT NULL,
	`timestamp` integer NOT NULL,
	`isRead` integer NOT NULL,
	`fromName` text,
	`fromAddress` text,
	`toJson` text NOT NULL,
	`subject` text NOT NULL,
	`preview` text NOT NULL,
	`attachmentCount` integer NOT NULL,
	`sizeBytes` integer NOT NULL,
	`messageId` text,
	`mailFrom` text NOT NULL,
	`rcptToJson` text NOT NULL,
	`clientAddress` text,
	`raw` text NOT NULL,
	FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailMessages_id_unique` ON `mailMessages` (`id`);--> statement-breakpoint
CREATE INDEX `mailMessages_by_mailbox_direction_seq` ON `mailMessages` (`mailboxId`,`direction`,`seq`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`localPart` text NOT NULL,
	`label` text,
	`createdAt` integer NOT NULL,
	`expiresAt` integer
);
--> statement-breakpoint
CREATE INDEX `mailboxes_by_owner` ON `mailboxes` (`ownerId`);--> statement-breakpoint
CREATE INDEX `mailboxes_by_expiration` ON `mailboxes` (`expiresAt`);