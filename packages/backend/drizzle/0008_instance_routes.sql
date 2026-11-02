ALTER TABLE `instances` ADD `routesJson` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` ADD `createdByApiKeyId` text;