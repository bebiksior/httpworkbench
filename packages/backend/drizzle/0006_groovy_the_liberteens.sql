DELETE FROM `instanceWebhooks` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `logs` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `instanceModerations` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `ownerId` = 'guest');--> statement-breakpoint
DELETE FROM `instances` WHERE `ownerId` = 'guest';--> statement-breakpoint
DROP TABLE `guestInstanceCredentials`;
