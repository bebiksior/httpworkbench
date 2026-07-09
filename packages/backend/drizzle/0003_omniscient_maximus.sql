DELETE FROM `instanceWebhooks` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `kind` = 'dynamic' OR `raw` IS NULL);--> statement-breakpoint
DELETE FROM `logs` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `kind` = 'dynamic' OR `raw` IS NULL);--> statement-breakpoint
DELETE FROM `instanceModerations` WHERE `instanceId` IN (SELECT `id` FROM `instances` WHERE `kind` = 'dynamic' OR `raw` IS NULL);--> statement-breakpoint
DELETE FROM `instances` WHERE `kind` = 'dynamic' OR `raw` IS NULL;--> statement-breakpoint
CREATE TABLE `__new_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer,
	`label` text,
	`isPublic` integer NOT NULL,
	`isLocked` integer NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_instances`("id", "ownerId", "createdAt", "expiresAt", "label", "isPublic", "isLocked", "raw") SELECT "id", "ownerId", "createdAt", "expiresAt", "label", "isPublic", "isLocked", "raw" FROM `instances`;--> statement-breakpoint
DROP TABLE `instances`;--> statement-breakpoint
ALTER TABLE `__new_instances` RENAME TO `instances`;--> statement-breakpoint
CREATE INDEX `instances_by_owner` ON `instances` (`ownerId`);--> statement-breakpoint
CREATE INDEX `instances_by_expiration` ON `instances` (`expiresAt`);
