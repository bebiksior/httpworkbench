DELETE FROM `instanceWebhooks` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `logs` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `instanceModerations` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `instances` WHERE `ownerId` = 'guest';--> statement-breakpoint
CREATE TABLE `guestInstanceCredentials` (
	`instanceId` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	FOREIGN KEY (`instanceId`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
