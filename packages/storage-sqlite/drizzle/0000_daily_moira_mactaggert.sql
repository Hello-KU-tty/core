CREATE TABLE `accepted_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`episode_id` text,
	`concept_id` text NOT NULL,
	`proposal_id` text,
	`decision_id` text,
	`supports_state` text,
	`correlation_id` text NOT NULL,
	`accepted_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposal_id`) REFERENCES `evidence_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decision_id`) REFERENCES `evidence_decisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "accepted_evidence_payload_json_valid" CHECK(json_valid("accepted_evidence"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `accepted_evidence_concept_idx` ON `accepted_evidence` (`concept_id`,`accepted_at`);--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`decision_id` text,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`correlation_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "activity_events_sequence_nonnegative" CHECK("activity_events"."sequence" >= 0),
	CONSTRAINT "activity_events_payload_json_valid" CHECK(json_valid("activity_events"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_project_sequence_unique` ON `activity_events` (`project_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `activity_events_correlation_idx` ON `activity_events` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `audit_records` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`resource_revision` integer,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`correlation_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	CONSTRAINT "audit_records_payload_json_valid" CHECK(json_valid("audit_records"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `audit_records_resource_idx` ON `audit_records` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_records_correlation_idx` ON `audit_records` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `candidate_parent_edges` (
	`candidate_id` text NOT NULL,
	`revision` integer NOT NULL,
	`parent_candidate_id` text NOT NULL,
	`parent_revision` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`candidate_id`, `revision`, `position`),
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_parent_edges_parent_unique` ON `candidate_parent_edges` (`candidate_id`,`revision`,`parent_candidate_id`,`parent_revision`);--> statement-breakpoint
CREATE TABLE `candidate_revisions` (
	`candidate_id` text NOT NULL,
	`revision` integer NOT NULL,
	`session_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`candidate_id`, `revision`),
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidate_revisions_revision_positive" CHECK("candidate_revisions"."revision" >= 1),
	CONSTRAINT "candidate_revisions_payload_json_valid" CHECK(json_valid("candidate_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `candidate_round_items` (
	`round_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`round_id`, `position`),
	FOREIGN KEY (`round_id`) REFERENCES `candidate_rounds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `candidate_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`round_index` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidate_rounds_round_index_positive" CHECK("candidate_rounds"."round_index" >= 1),
	CONSTRAINT "candidate_rounds_payload_json_valid" CHECK(json_valid("candidate_rounds"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_rounds_session_round_unique` ON `candidate_rounds` (`session_id`,`round_index`);--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidates_head_revision_positive" CHECK("candidates"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `candidates_session_idx` ON `candidates` (`session_id`);--> statement-breakpoint
CREATE TABLE `canonical_concept_revisions` (
	`concept_id` text NOT NULL,
	`revision` integer NOT NULL,
	`canonical_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`concept_id`, `revision`),
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "canonical_concept_revisions_revision_positive" CHECK("canonical_concept_revisions"."revision" >= 1),
	CONSTRAINT "canonical_concept_revisions_payload_json_valid" CHECK(json_valid("canonical_concept_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `canonical_concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`head_revision` integer NOT NULL,
	`canonical_name` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "canonical_concepts_head_revision_positive" CHECK("canonical_concepts"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canonical_concepts_name_unique` ON `canonical_concepts` (`canonical_name`);--> statement-breakpoint
CREATE TABLE `completion_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`expected_task_revision` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`completed_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "completion_reports_payload_json_valid" CHECK(json_valid("completion_reports"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completion_reports_task_id_unique` ON `completion_reports` (`task_id`);--> statement-breakpoint
CREATE TABLE `concept_alias_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text,
	`proposed_alias` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`proposed_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concept_alias_proposals_payload_json_valid" CHECK(json_valid("concept_alias_proposals"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `concept_alias_proposals_concept_status_idx` ON `concept_alias_proposals` (`concept_id`,`status`);--> statement-breakpoint
CREATE TABLE `concept_ledger_revisions` (
	`ledger_id` text NOT NULL,
	`revision` integer NOT NULL,
	`concept_id` text NOT NULL,
	`state` text NOT NULL,
	`reducer_version` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`ledger_id`, `revision`),
	FOREIGN KEY (`ledger_id`) REFERENCES `concept_ledgers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concept_ledger_revisions_revision_positive" CHECK("concept_ledger_revisions"."revision" >= 1),
	CONSTRAINT "concept_ledger_revisions_payload_json_valid" CHECK(json_valid("concept_ledger_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `concept_ledgers` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`state` text NOT NULL,
	`reducer_version` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concept_ledgers_head_revision_positive" CHECK("concept_ledgers"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_ledgers_concept_id_unique` ON `concept_ledgers` (`concept_id`);--> statement-breakpoint
CREATE TABLE `decision_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`resolution_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`applied_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_id`) REFERENCES `decision_resolutions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_applications_payload_json_valid" CHECK(json_valid("decision_applications"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_applications_decision_id_unique` ON `decision_applications` (`decision_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `decision_applications_resolution_id_unique` ON `decision_applications` (`resolution_id`);--> statement-breakpoint
CREATE TABLE `decision_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`context_version` integer NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`correlation_id` text NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_requests_payload_json_valid" CHECK(json_valid("decision_requests"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `decision_requests_project_status_idx` ON `decision_requests` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `decision_resolutions` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`resolved_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_resolutions_payload_json_valid" CHECK(json_valid("decision_resolutions"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_resolutions_decision_id_unique` ON `decision_resolutions` (`decision_id`);--> statement-breakpoint
CREATE TABLE `discovery_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`round_id` text NOT NULL,
	`intent` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`round_id`) REFERENCES `candidate_rounds`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "discovery_feedback_payload_json_valid" CHECK(json_valid("discovery_feedback"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `discovery_feedback_session_idx` ON `discovery_feedback` (`session_id`);--> statement-breakpoint
CREATE TABLE `discovery_selections` (
	`session_id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`selected_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`feedback_id`) REFERENCES `discovery_feedback`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_selections_feedback_id_unique` ON `discovery_selections` (`feedback_id`);--> statement-breakpoint
CREATE TABLE `discovery_session_revisions` (
	`session_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`session_id`, `revision`),
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "discovery_session_revisions_revision_positive" CHECK("discovery_session_revisions"."revision" >= 1),
	CONSTRAINT "discovery_session_revisions_payload_json_valid" CHECK(json_valid("discovery_session_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `discovery_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "discovery_sessions_head_revision_positive" CHECK("discovery_sessions"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `discovery_sessions_project_idx` ON `discovery_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `discovery_sessions_status_idx` ON `discovery_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `episode_event_edges` (
	`episode_id` text NOT NULL,
	`episode_revision` integer NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`episode_id`, `episode_revision`, `position`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `activity_events`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_event_edges_event_unique` ON `episode_event_edges` (`episode_id`,`episode_revision`,`event_id`);--> statement-breakpoint
CREATE TABLE `episode_revisions` (
	`episode_id` text NOT NULL,
	`revision` integer NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`episode_id`, `revision`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "episode_revisions_revision_positive" CHECK("episode_revisions"."revision" >= 1),
	CONSTRAINT "episode_revisions_payload_json_valid" CHECK(json_valid("episode_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`decision_id` text,
	`head_revision` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decision_id`) REFERENCES `decision_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "episodes_head_revision_positive" CHECK("episodes"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `episodes_project_status_idx` ON `episodes` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `evidence_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`outcome` text NOT NULL,
	`reason_code` text NOT NULL,
	`correlation_id` text NOT NULL,
	`decided_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `evidence_proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_decisions_payload_json_valid" CHECK(json_valid("evidence_decisions"."payload_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_decisions_proposal_id_unique` ON `evidence_decisions` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `evidence_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`episode_id` text NOT NULL,
	`concept_id` text,
	`signal` text NOT NULL,
	`strength` text NOT NULL,
	`prompt_dependence` text NOT NULL,
	`correlation_id` text NOT NULL,
	`proposed_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evidence_proposals_payload_json_valid" CHECK(json_valid("evidence_proposals"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `evidence_proposals_concept_idx` ON `evidence_proposals` (`concept_id`);--> statement-breakpoint
CREATE INDEX `evidence_proposals_episode_idx` ON `evidence_proposals` (`episode_id`);--> statement-breakpoint
CREATE TABLE `idempotency_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`correlation_id` text NOT NULL,
	`operation` text NOT NULL,
	`resource_id` text NOT NULL,
	`resource_revision` integer,
	`recorded_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	CONSTRAINT "idempotency_receipts_payload_json_valid" CHECK(json_valid("idempotency_receipts"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `idempotency_receipts_correlation_idx` ON `idempotency_receipts` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `idempotency_receipts_resource_idx` ON `idempotency_receipts` (`resource_id`);--> statement-breakpoint
CREATE TABLE `learning_spec_revisions` (
	`spec_id` text NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`spec_id`, `revision`),
	FOREIGN KEY (`spec_id`) REFERENCES `learning_specs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "learning_spec_revisions_revision_positive" CHECK("learning_spec_revisions"."revision" >= 1),
	CONSTRAINT "learning_spec_revisions_payload_json_valid" CHECK(json_valid("learning_spec_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `learning_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "learning_specs_head_revision_positive" CHECK("learning_specs"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `learning_specs_project_status_idx` ON `learning_specs` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `live_context_versions` (
	`context_id` text NOT NULL,
	`context_version` integer NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`checkpoint` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`context_id`, `context_version`),
	FOREIGN KEY (`context_id`) REFERENCES `live_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "live_context_versions_version_positive" CHECK("live_context_versions"."context_version" >= 1),
	CONSTRAINT "live_context_versions_payload_json_valid" CHECK(json_valid("live_context_versions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `live_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`head_version` integer NOT NULL,
	`checkpoint` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "live_contexts_head_version_positive" CHECK("live_contexts"."head_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_contexts_task_unique` ON `live_contexts` (`task_id`);--> statement-breakpoint
CREATE TABLE `misconception_issue_history` (
	`issue_id` text NOT NULL,
	`storage_revision` integer NOT NULL,
	`concept_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`recorded_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`issue_id`, `storage_revision`),
	FOREIGN KEY (`issue_id`) REFERENCES `misconception_issues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "misconception_issue_history_revision_positive" CHECK("misconception_issue_history"."storage_revision" >= 1),
	CONSTRAINT "misconception_issue_history_payload_json_valid" CHECK(json_valid("misconception_issue_history"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `misconception_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`project_id` text NOT NULL,
	`head_storage_revision` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `canonical_concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "misconception_issues_head_revision_positive" CHECK("misconception_issues"."head_storage_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `misconception_issues_concept_status_idx` ON `misconception_issues` (`concept_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_revisions` (
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`project_id`, `revision`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "project_revisions_revision_positive" CHECK("project_revisions"."revision" >= 1),
	CONSTRAINT "project_revisions_payload_json_valid" CHECK(json_valid("project_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE INDEX `project_revisions_correlation_idx` ON `project_revisions` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`head_revision` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "projects_head_revision_positive" CHECK("projects"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `task_revisions` (
	`task_id` text NOT NULL,
	`revision` integer NOT NULL,
	`project_id` text NOT NULL,
	`spec_id` text NOT NULL,
	`spec_revision` integer NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	PRIMARY KEY(`task_id`, `revision`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`spec_id`) REFERENCES `learning_specs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "task_revisions_revision_positive" CHECK("task_revisions"."revision" >= 1),
	CONSTRAINT "task_revisions_payload_json_valid" CHECK(json_valid("task_revisions"."payload_json"))
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`spec_id` text NOT NULL,
	`head_revision` integer NOT NULL,
	`sequence` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`spec_id`) REFERENCES `learning_specs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tasks_head_revision_positive" CHECK("tasks"."head_revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_project_sequence_unique` ON `tasks` (`project_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `tasks_project_status_idx` ON `tasks` (`project_id`,`status`);
