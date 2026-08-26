CREATE TABLE `baseline_results` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_run_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`kind` text NOT NULL,
	`baseline_name` text NOT NULL,
	`baseline_version` text NOT NULL,
	`recorded_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`evaluation_run_id`) REFERENCES `evaluation_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "baseline_results_payload_json_valid" CHECK(json_valid("baseline_results"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_results_identity_unique` ON `baseline_results` (`kind`,`baseline_name`,`baseline_version`);--> statement-breakpoint
CREATE INDEX `baseline_results_evaluation_run_idx` ON `baseline_results` (`evaluation_run_id`);--> statement-breakpoint
CREATE TABLE `evaluation_run_revisions` (
	`evaluation_run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`evaluation_run_id`, `revision`),
	FOREIGN KEY (`evaluation_run_id`) REFERENCES `evaluation_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_run_revisions_revision_positive" CHECK("evaluation_run_revisions"."revision" >= 1),
	CONSTRAINT "evaluation_run_revisions_payload_json_valid" CHECK(json_valid("evaluation_run_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`evaluator_version` text NOT NULL,
	`system_under_test_version` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "evaluation_runs_head_revision_positive" CHECK("evaluation_runs"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `evaluation_runs_status_idx` ON `evaluation_runs` (`status`);--> statement-breakpoint
CREATE INDEX `evaluation_runs_correlation_idx` ON `evaluation_runs` (`correlation_id`);