ALTER TABLE `tags` DROP FOREIGN KEY `tags_owner_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `tags` DROP INDEX `uq_tags_owner_name`;
--> statement-breakpoint
ALTER TABLE `ticket_activities` MODIFY COLUMN `type` enum('TICKET_CREATED','STATUS_CHANGED','PRIORITY_CHANGED','TYPE_CHANGED','TITLE_CHANGED','FIELDS_UPDATED','BLOCKED','UNBLOCKED','TICKET_ARCHIVED','TICKET_RESTORED','CHECKLIST_ITEM_ADDED','CHECKLIST_ITEM_COMPLETED','CHECKLIST_ITEM_REOPENED','CHECKLIST_ITEM_REMOVED','LINK_ADDED','LINK_REMOVED','RELATION_ADDED','RELATION_REMOVED','TAG_ADDED','TAG_REMOVED') NOT NULL;
--> statement-breakpoint
ALTER TABLE `ticket_links` MODIFY COLUMN `label` varchar(120);
--> statement-breakpoint
ALTER TABLE `ticket_links` MODIFY COLUMN `url` varchar(1000) NOT NULL;
--> statement-breakpoint
ALTER TABLE `tickets` MODIFY COLUMN `status` enum('PLANNED','IN_PROGRESS','IMPLEMENTED','TESTED','DEPLOYED') NOT NULL DEFAULT 'PLANNED';
--> statement-breakpoint
ALTER TABLE `tickets` MODIFY COLUMN `description` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` MODIFY COLUMN `motivation` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` MODIFY COLUMN `limitations` mediumtext;
--> statement-breakpoint
ALTER TABLE `tags` ADD `project_id` char(36) NOT NULL;
--> statement-breakpoint
ALTER TABLE `tags` ADD `slug` varchar(60) NOT NULL;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `acceptance_criteria` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `implementation_notes` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `testing_notes` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `deployment_notes` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `known_issues` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `follow_up_notes` mediumtext;
--> statement-breakpoint
ALTER TABLE `tickets` ADD `is_blocked` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `uq_tags_project_slug` UNIQUE(`project_id`,`slug`);
--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_tags_project_id` ON `tags` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_tickets_project_blocked` ON `tickets` (`project_id`,`is_blocked`);
--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `owner_id`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `acceptanceCriteria`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `implementationNotes`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `testingNotes`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `deploymentNotes`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `knownIssues`;
--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `followUpNotes`;
