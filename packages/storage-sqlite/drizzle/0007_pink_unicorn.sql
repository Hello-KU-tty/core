CREATE TABLE `personalization_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`discovery_session_id` text,
	`task_id` text,
	`mode` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`discovery_session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "personalization_traces_target_shape" CHECK(("personalization_traces"."target_kind" = 'DISCOVERY_SESSION' AND "personalization_traces"."discovery_session_id" IS NOT NULL AND "personalization_traces"."task_id" IS NULL) OR ("personalization_traces"."target_kind" = 'HELPER_TURN' AND "personalization_traces"."discovery_session_id" IS NULL AND "personalization_traces"."task_id" IS NOT NULL)),
	CONSTRAINT "personalization_traces_payload_json_valid" CHECK(json_valid("personalization_traces"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `personalization_traces_project_created_idx` ON `personalization_traces` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `personalization_traces_discovery_session_idx` ON `personalization_traces` (`discovery_session_id`);--> statement-breakpoint
CREATE INDEX `personalization_traces_correlation_idx` ON `personalization_traces` (`correlation_id`);
