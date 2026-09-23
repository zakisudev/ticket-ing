CREATE TABLE `project_ticket_counters` (
	`project_id` char(36) NOT NULL,
	`last_number` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_ticket_counters_project_id` PRIMARY KEY(`project_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` char(36) NOT NULL,
	`owner_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`project_key` varchar(10) NOT NULL,
	`description` text,
	`color` varchar(32),
	`icon` varchar(32),
	`repository_url` varchar(1000),
	`staging_url` varchar(1000),
	`production_url` varchar(1000),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`archived_at` datetime,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_projects_owner_slug` UNIQUE(`owner_id`,`slug`),
	CONSTRAINT `uq_projects_owner_key` UNIQUE(`owner_id`,`project_key`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`last_used_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` char(36) NOT NULL,
	`owner_id` char(36) NOT NULL,
	`name` varchar(50) NOT NULL,
	`color` varchar(32),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tags_owner_name` UNIQUE(`owner_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `ticket_activities` (
	`id` char(36) NOT NULL,
	`seq` bigint AUTO_INCREMENT NOT NULL,
	`ticket_id` char(36) NOT NULL,
	`actor_user_id` char(36),
	`type` enum('TICKET_CREATED','STATUS_CHANGED','PRIORITY_CHANGED','TYPE_CHANGED','TITLE_CHANGED','FIELDS_UPDATED','BLOCKED','UNBLOCKED','TICKET_ARCHIVED','TICKET_RESTORED') NOT NULL,
	`metadata` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ticket_activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticket_activities_seq_unique` UNIQUE(`seq`)
);
--> statement-breakpoint
CREATE TABLE `ticket_checklist_items` (
	`id` char(36) NOT NULL,
	`ticket_id` char(36) NOT NULL,
	`text` varchar(500) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`completed_at` datetime,
	CONSTRAINT `ticket_checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_links` (
	`id` char(36) NOT NULL,
	`ticket_id` char(36) NOT NULL,
	`type` enum('COMMIT','PULL_REQUEST','REPOSITORY','DEPLOYMENT','DOCUMENTATION','ISSUE','CHAT','OTHER') NOT NULL,
	`label` varchar(120) NOT NULL,
	`url` varchar(1000),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ticket_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_relations` (
	`id` char(36) NOT NULL,
	`ticket_id` char(36) NOT NULL,
	`related_ticket_id` char(36) NOT NULL,
	`type` enum('BLOCKS','FOLLOWS_UP','RELATED_TO') NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ticket_relations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ticket_relations` UNIQUE(`ticket_id`,`related_ticket_id`,`type`)
);
--> statement-breakpoint
CREATE TABLE `ticket_tags` (
	`ticket_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	CONSTRAINT `ticket_tags_ticket_id_tag_id_pk` PRIMARY KEY(`ticket_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`ticket_number` int NOT NULL,
	`import_key` varchar(120),
	`title` varchar(200) NOT NULL,
	`status` enum('PLANNED','IN_PROGRESS','IMPLEMENTED','TESTED','DEPLOYED','BLOCKED','ARCHIVED') NOT NULL DEFAULT 'PLANNED',
	`priority` enum('P0','P1','P2','P3') NOT NULL DEFAULT 'P2',
	`type` enum('FEATURE','BUG','SECURITY','OPS','UX','REFACTOR','RESEARCH','DOCUMENTATION') NOT NULL DEFAULT 'FEATURE',
	`summary` varchar(500),
	`description` text,
	`motivation` text,
	`acceptanceCriteria` text,
	`implementationNotes` text,
	`testingNotes` text,
	`deploymentNotes` text,
	`limitations` text,
	`knownIssues` text,
	`followUpNotes` text,
	`blocked_reason` varchar(500),
	`source_reference` varchar(300),
	`version` int NOT NULL DEFAULT 1,
	`started_at` datetime,
	`implemented_at` datetime,
	`tested_at` datetime,
	`deployed_at` datetime,
	`archived_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tickets_project_number` UNIQUE(`project_id`,`ticket_number`),
	CONSTRAINT `uq_tickets_project_import_key` UNIQUE(`project_id`,`import_key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(100),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `project_ticket_counters` ADD CONSTRAINT `project_ticket_counters_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_activities` ADD CONSTRAINT `ticket_activities_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_activities` ADD CONSTRAINT `ticket_activities_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_checklist_items` ADD CONSTRAINT `ticket_checklist_items_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_links` ADD CONSTRAINT `ticket_links_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_relations` ADD CONSTRAINT `ticket_relations_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_relations` ADD CONSTRAINT `ticket_relations_related_ticket_id_tickets_id_fk` FOREIGN KEY (`related_ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_tags` ADD CONSTRAINT `ticket_tags_ticket_id_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_tags` ADD CONSTRAINT `ticket_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_projects_owner_id` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_activities_ticket_created` ON `ticket_activities` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_checklist_ticket_sort` ON `ticket_checklist_items` (`ticket_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_ticket_links_ticket` ON `ticket_links` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_relations_ticket` ON `ticket_relations` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_relations_related` ON `ticket_relations` (`related_ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_tags_tag` ON `ticket_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_project_status` ON `tickets` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_project_updated` ON `tickets` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tickets_status` ON `tickets` (`status`);