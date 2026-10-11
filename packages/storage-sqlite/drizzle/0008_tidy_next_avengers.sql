CREATE TABLE `next_move_job_revisions` (
	`next_move_job_id` text NOT NULL,
	`revision` integer NOT NULL,
	`project_id` text NOT NULL,
	`source_task_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`next_move_job_id`, `revision`),
	FOREIGN KEY (`next_move_job_id`) REFERENCES `next_move_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "next_move_job_revisions_revision_positive" CHECK("next_move_job_revisions"."revision" >= 1),
	CONSTRAINT "next_move_job_revisions_attempt_nonnegative" CHECK("next_move_job_revisions"."attempt" >= 0),
	CONSTRAINT "next_move_job_revisions_payload_json_valid" CHECK(json_valid("next_move_job_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `next_move_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_task_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "next_move_jobs_head_revision_positive" CHECK("next_move_jobs"."head_revision" >= 1),
	CONSTRAINT "next_move_jobs_attempt_nonnegative" CHECK("next_move_jobs"."attempt" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `next_move_jobs_source_task_id_unique` ON `next_move_jobs` (`source_task_id`);--> statement-breakpoint
CREATE INDEX `next_move_jobs_status_updated_idx` ON `next_move_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `next_move_jobs_project_idx` ON `next_move_jobs` (`project_id`);