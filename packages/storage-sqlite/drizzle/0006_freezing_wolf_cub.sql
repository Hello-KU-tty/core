CREATE TABLE `candidate_enrichments` (
	`candidate_id` text PRIMARY KEY NOT NULL,
	`preview_round_id` text NOT NULL,
	`session_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`preview_round_id`) REFERENCES `candidate_preview_rounds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidate_enrichments_payload_json_valid" CHECK(json_valid("candidate_enrichments"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `candidate_enrichments_preview_round_idx` ON `candidate_enrichments` (`preview_round_id`);--> statement-breakpoint
CREATE INDEX `candidate_enrichments_session_idx` ON `candidate_enrichments` (`session_id`);--> statement-breakpoint
CREATE TABLE `candidate_preview_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`final_round_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidate_preview_rounds_payload_json_valid" CHECK(json_valid("candidate_preview_rounds"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_preview_rounds_final_round_id_unique` ON `candidate_preview_rounds` (`final_round_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_preview_rounds_session_unique` ON `candidate_preview_rounds` (`session_id`);