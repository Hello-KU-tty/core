CREATE TABLE `analysis_job_revisions` (
	`analysis_job_id` text NOT NULL,
	`revision` integer NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`episode_revision` integer NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`analysis_job_id`, `revision`),
	FOREIGN KEY (`analysis_job_id`) REFERENCES `analysis_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "analysis_job_revisions_revision_positive" CHECK("analysis_job_revisions"."revision" >= 1),
	CONSTRAINT "analysis_job_revisions_attempt_nonnegative" CHECK("analysis_job_revisions"."attempt" >= 0),
	CONSTRAINT "analysis_job_revisions_payload_json_valid" CHECK(json_valid("analysis_job_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `analysis_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`episode_revision` integer NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "analysis_jobs_head_revision_positive" CHECK("analysis_jobs"."head_revision" >= 1),
	CONSTRAINT "analysis_jobs_attempt_nonnegative" CHECK("analysis_jobs"."attempt" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_jobs_episode_id_unique` ON `analysis_jobs` (`episode_id`);--> statement-breakpoint
CREATE INDEX `analysis_jobs_status_updated_idx` ON `analysis_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `analysis_jobs_correlation_idx` ON `analysis_jobs` (`correlation_id`);