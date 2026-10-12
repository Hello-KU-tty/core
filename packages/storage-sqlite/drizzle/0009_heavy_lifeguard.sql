CREATE TABLE `decision_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`resolution_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`disputed_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_id`) REFERENCES `decision_resolutions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_disputes_payload_json_valid" CHECK(json_valid("decision_disputes"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_disputes_decision_id_unique` ON `decision_disputes` (`decision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `decision_disputes_resolution_id_unique` ON `decision_disputes` (`resolution_id`);--> statement-breakpoint
CREATE INDEX `decision_disputes_project_idx` ON `decision_disputes` (`project_id`,`disputed_at`);--> statement-breakpoint
CREATE TABLE `evidence_withdrawals` (
	`evidence_id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`project_id` text NOT NULL,
	`decision_dispute_id` text NOT NULL,
	`withdrawn_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`evidence_id`) REFERENCES `accepted_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decision_dispute_id`) REFERENCES `decision_disputes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_withdrawals_payload_json_valid" CHECK(json_valid("evidence_withdrawals"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `evidence_withdrawals_concept_idx` ON `evidence_withdrawals` (`concept_id`);