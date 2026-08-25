CREATE TABLE `decision_states` (
	`decision_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`resolution_id` text,
	`application_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_id`) REFERENCES `decision_resolutions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`application_id`) REFERENCES `decision_applications`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_states_status_valid" CHECK("decision_states"."status" IN ('REQUESTED', 'RESOLVED', 'APPLIED'))
);
--> statement-breakpoint
CREATE INDEX `decision_states_project_status_idx` ON `decision_states` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_active_tasks` (
	`project_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`task_revision` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`,`task_revision`) REFERENCES `task_revisions`(`task_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "project_active_tasks_status_valid" CHECK("project_active_tasks"."status" IN ('ACTIVE', 'BLOCKED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_active_tasks_task_id_unique` ON `project_active_tasks` (`task_id`);--> statement-breakpoint
INSERT INTO `project_active_tasks` (`project_id`, `task_id`, `task_revision`, `status`, `updated_at`)
SELECT `project_id`, `id`, `head_revision`, `status`, `updated_at`
FROM `tasks`
WHERE `status` IN ('ACTIVE', 'BLOCKED');--> statement-breakpoint
INSERT INTO `decision_states` (`decision_id`, `project_id`, `task_id`, `status`, `resolution_id`, `application_id`, `updated_at`)
SELECT
	requests.`id`,
	requests.`project_id`,
	requests.`task_id`,
	requests.`status`,
	resolutions.`id`,
	applications.`id`,
	requests.`updated_at`
FROM `decision_requests` requests
LEFT JOIN `decision_resolutions` resolutions ON resolutions.`decision_id` = requests.`id`
LEFT JOIN `decision_applications` applications ON applications.`decision_id` = requests.`id`;--> statement-breakpoint
DROP INDEX `decision_requests_project_status_idx`;--> statement-breakpoint
CREATE INDEX `decision_requests_project_idx` ON `decision_requests` (`project_id`,`requested_at`);--> statement-breakpoint
ALTER TABLE `decision_requests` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `decision_requests` DROP COLUMN `updated_at`;
