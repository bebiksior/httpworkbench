CREATE TABLE `phoneProviders` (
	`userId` text NOT NULL,
	`provider` text NOT NULL,
	`credentialsCiphertext` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `provider`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Keys that held every scope keep full access, which dashboard sign-in requires.
UPDATE `apiKeys`
SET `scopesJson` = json_insert(`scopesJson`, '$[#]', 'phones:read', '$[#]', 'phones:write')
WHERE json_valid(`scopesJson`) AND (
	SELECT count(DISTINCT `value`) FROM json_each(`apiKeys`.`scopesJson`)
	WHERE `value` IN ('instances:read', 'instances:write', 'instances:delete', 'logs:read', 'logs:stream', 'mailboxes:read', 'mailboxes:write', 'mailboxes:send')
) = 8;
