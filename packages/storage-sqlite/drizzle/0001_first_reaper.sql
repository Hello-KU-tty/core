PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_candidate_parent_edges` (
	`candidate_id` text NOT NULL,
	`revision` integer NOT NULL,
	`parent_candidate_id` text NOT NULL,
	`parent_revision` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`candidate_id`, `revision`, `position`),
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`,`revision`) REFERENCES `candidate_revisions`(`candidate_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_candidate_id`,`parent_revision`) REFERENCES `candidate_revisions`(`candidate_id`,`revision`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_candidate_parent_edges`("candidate_id", "revision", "parent_candidate_id", "parent_revision", "position") SELECT "candidate_id", "revision", "parent_candidate_id", "parent_revision", "position" FROM `candidate_parent_edges`;--> statement-breakpoint
DROP TABLE `candidate_parent_edges`;--> statement-breakpoint
ALTER TABLE `__new_candidate_parent_edges` RENAME TO `candidate_parent_edges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_parent_edges_parent_unique` ON `candidate_parent_edges` (`candidate_id`,`revision`,`parent_candidate_id`,`parent_revision`);--> statement-breakpoint
CREATE TABLE `__new_candidate_round_items` (
	`round_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`round_id`, `position`),
	FOREIGN KEY (`round_id`) REFERENCES `candidate_rounds`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`,`candidate_revision`) REFERENCES `candidate_revisions`(`candidate_id`,`revision`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_candidate_round_items`("round_id", "candidate_id", "candidate_revision", "position") SELECT "round_id", "candidate_id", "candidate_revision", "position" FROM `candidate_round_items`;--> statement-breakpoint
DROP TABLE `candidate_round_items`;--> statement-breakpoint
ALTER TABLE `__new_candidate_round_items` RENAME TO `candidate_round_items`;--> statement-breakpoint
CREATE TABLE `__new_discovery_selections` (
	`session_id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_revision` integer NOT NULL,
	`selected_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `discovery_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`feedback_id`) REFERENCES `discovery_feedback`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`,`candidate_revision`) REFERENCES `candidate_revisions`(`candidate_id`,`revision`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_discovery_selections`("session_id", "feedback_id", "candidate_id", "candidate_revision", "selected_at") SELECT "session_id", "feedback_id", "candidate_id", "candidate_revision", "selected_at" FROM `discovery_selections`;--> statement-breakpoint
DROP TABLE `discovery_selections`;--> statement-breakpoint
ALTER TABLE `__new_discovery_selections` RENAME TO `discovery_selections`;--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_selections_feedback_id_unique` ON `discovery_selections` (`feedback_id`);--> statement-breakpoint
CREATE TABLE `__new_episode_event_edges` (
	`episode_id` text NOT NULL,
	`episode_revision` integer NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`episode_id`, `episode_revision`, `position`),
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `activity_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`episode_id`,`episode_revision`) REFERENCES `episode_revisions`(`episode_id`,`revision`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_episode_event_edges`("episode_id", "episode_revision", "event_id", "position") SELECT "episode_id", "episode_revision", "event_id", "position" FROM `episode_event_edges`;--> statement-breakpoint
DROP TABLE `episode_event_edges`;--> statement-breakpoint
ALTER TABLE `__new_episode_event_edges` RENAME TO `episode_event_edges`;--> statement-breakpoint
CREATE UNIQUE INDEX `episode_event_edges_event_unique` ON `episode_event_edges` (`episode_id`,`episode_revision`,`event_id`);--> statement-breakpoint
CREATE TABLE `__new_learning_spec_revisions` (
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
	FOREIGN KEY (`candidate_id`,`candidate_revision`) REFERENCES `candidate_revisions`(`candidate_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "learning_spec_revisions_revision_positive" CHECK("__new_learning_spec_revisions"."revision" >= 1),
	CONSTRAINT "learning_spec_revisions_payload_json_valid" CHECK(json_valid("__new_learning_spec_revisions"."payload_json"))
);
--> statement-breakpoint
INSERT INTO `__new_learning_spec_revisions`("spec_id", "project_id", "revision", "status", "candidate_id", "candidate_revision", "correlation_id", "created_at", "updated_at", "payload_json", "payload_hash") SELECT "spec_id", "project_id", "revision", "status", "candidate_id", "candidate_revision", "correlation_id", "created_at", "updated_at", "payload_json", "payload_hash" FROM `learning_spec_revisions`;--> statement-breakpoint
DROP TABLE `learning_spec_revisions`;--> statement-breakpoint
ALTER TABLE `__new_learning_spec_revisions` RENAME TO `learning_spec_revisions`;--> statement-breakpoint
CREATE TABLE `__new_task_revisions` (
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
	FOREIGN KEY (`spec_id`,`spec_revision`) REFERENCES `learning_spec_revisions`(`spec_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "task_revisions_revision_positive" CHECK("__new_task_revisions"."revision" >= 1),
	CONSTRAINT "task_revisions_payload_json_valid" CHECK(json_valid("__new_task_revisions"."payload_json"))
);
--> statement-breakpoint
INSERT INTO `__new_task_revisions`("task_id", "revision", "project_id", "spec_id", "spec_revision", "sequence", "status", "correlation_id", "created_at", "updated_at", "payload_json", "payload_hash") SELECT "task_id", "revision", "project_id", "spec_id", "spec_revision", "sequence", "status", "correlation_id", "created_at", "updated_at", "payload_json", "payload_hash" FROM `task_revisions`;--> statement-breakpoint
DROP TABLE `task_revisions`;--> statement-breakpoint
ALTER TABLE `__new_task_revisions` RENAME TO `task_revisions`;