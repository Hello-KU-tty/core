CREATE TABLE `context_refresh_request_revisions` (
	`request_id` text NOT NULL,
	`revision` integer NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`requested_at` text NOT NULL,
	`fulfilled_at` text,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`request_id`, `revision`),
	FOREIGN KEY (`request_id`) REFERENCES `context_refresh_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "context_refresh_request_revisions_revision_positive" CHECK("context_refresh_request_revisions"."revision" >= 1),
	CONSTRAINT "context_refresh_request_revisions_status_valid" CHECK("context_refresh_request_revisions"."status" IN ('PENDING', 'FULFILLED')),
	CONSTRAINT "context_refresh_request_revisions_payload_json_valid" CHECK(json_valid("context_refresh_request_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `context_refresh_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "context_refresh_requests_head_revision_positive" CHECK("context_refresh_requests"."head_revision" >= 1),
	CONSTRAINT "context_refresh_requests_status_valid" CHECK("context_refresh_requests"."status" IN ('PENDING', 'FULFILLED'))
);
--> statement-breakpoint
CREATE INDEX `context_refresh_requests_task_status_idx` ON `context_refresh_requests` (`task_id`,`status`);