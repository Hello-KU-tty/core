import {
  type BuilderTaskAggregate,
  type DiscoveryAggregate,
  type EpisodeAggregate,
  PersistenceError,
  type EvidenceTrace,
  type IdempotencyReceipt,
  type PersistenceRepository,
  type PersistenceWriteResult,
  type ProjectRecoveryState,
} from '@vibe-helper/application'
import {
  acceptedEvidenceSchema,
  activityEventSchema,
  auditRecordSchema,
  builderTaskSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  conceptAliasProposalSchema,
  conceptLedgerEntrySchema,
  correlationIdSchema,
  decisionApplicationSchema,
  decisionRequestSchema,
  decisionResolutionSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  episodeSchema,
  evidenceDecisionSchema,
  evidenceProposalSchema,
  idempotencyKeySchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  misconceptionIssueSchema,
  projectCandidateRevisionSchema,
  projectSchema,
  stableEntityIdSchema,
  taskCompletionReportSchema,
  utcTimestampSchema,
  type AcceptedEvidence,
  type ActivityEvent,
  type AuditRecord,
  type BuilderTask,
  type CandidateRound,
  type CanonicalConcept,
  type ConceptAliasProposal,
  type ConceptLedgerEntry,
  type DecisionApplication,
  type DecisionRequest,
  type DecisionResolution,
  type DiscoveryFeedback,
  type DiscoverySession,
  type Episode,
  type EvidenceDecision,
  type EvidenceProposal,
  type LearningSpecRevision,
  type LiveProjectContext,
  type MisconceptionIssue,
  type Project,
  type ProjectCandidateRevision,
  type TaskCompletionReport,
} from '@vibe-helper/contracts'
import type Database from 'better-sqlite3'

import {
  assertPayloadSafe,
  parseStoredRecord,
  prepareRecord,
  stableStringify,
  type PreparedRecord,
} from './serialization.js'

interface ContractSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false }
}

interface PayloadRow {
  readonly payload_json: string
  readonly payload_hash: string
}

interface HeadRow {
  readonly head_revision: number
}

interface HeadVersionRow {
  readonly head_version: number
}

interface IssueHeadRow {
  readonly head_storage_revision: number
}

interface ProjectIdentityRow {
  readonly project_id: string
}

interface VersionedAppendOptions<T> {
  readonly recordId: string
  readonly revision: number
  readonly prepared: PreparedRecord<T>
  readonly existingSql: string
  readonly existingParams: readonly unknown[]
  readonly headSql: string
  readonly headParams: readonly unknown[]
  readonly insertStable: () => void
  readonly insertHistory: () => void
  readonly updateHead: () => void
}

const inserted = (recordId: string, revision?: number): PersistenceWriteResult =>
  revision === undefined
    ? { outcome: 'INSERTED', recordId }
    : { outcome: 'INSERTED', recordId, revision }

const noOp = (recordId: string, revision?: number): PersistenceWriteResult =>
  revision === undefined ? { outcome: 'NO_OP', recordId } : { outcome: 'NO_OP', recordId, revision }

export class SqlitePersistenceRepository implements PersistenceRepository {
  readonly #sqlite: Database.Database

  constructor(sqlite: Database.Database) {
    this.#sqlite = sqlite
  }

  appendProject(input: Project): PersistenceWriteResult {
    const prepared = prepareRecord(projectSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM project_revisions WHERE project_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM projects WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO projects (id, head_revision, status, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(record.id, record.revision, record.status, record.correlationId, record.updatedAt)
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO project_revisions (project_id, revision, status, correlation_id, created_at, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.status,
              record.correlationId,
              record.createdAt,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE projects SET head_revision = ?, status = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(record.revision, record.status, record.correlationId, record.updatedAt, record.id)
        },
      }),
    )
  }

  appendDiscoverySession(input: DiscoverySession): PersistenceWriteResult {
    const prepared = prepareRecord(discoverySessionSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM discovery_session_revisions WHERE session_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM discovery_sessions WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO discovery_sessions (id, project_id, head_revision, status, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.revision,
              record.status,
              record.correlationId,
              record.updatedAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO discovery_session_revisions (session_id, revision, status, correlation_id, opened_at, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.status,
              record.correlationId,
              record.openedAt,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE discovery_sessions SET head_revision = ?, status = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(record.revision, record.status, record.correlationId, record.updatedAt, record.id)
        },
      }),
    )
  }

  appendCandidate(input: ProjectCandidateRevision): PersistenceWriteResult {
    const prepared = prepareRecord(projectCandidateRevisionSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM candidate_revisions WHERE candidate_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM candidates WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO candidates (id, session_id, head_revision, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.discoverySessionId,
              record.revision,
              record.correlationId,
              record.createdAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO candidate_revisions (candidate_id, revision, session_id, correlation_id, created_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.discoverySessionId,
              record.correlationId,
              record.createdAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE candidates SET head_revision = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(record.revision, record.correlationId, record.createdAt, record.id)
        },
      })
      if (result.outcome === 'INSERTED') {
        const statement = this.#sqlite.prepare(
          'INSERT INTO candidate_parent_edges (candidate_id, revision, parent_candidate_id, parent_revision, position) VALUES (?, ?, ?, ?, ?)',
        )
        record.parentRevisions.forEach((parent, position) => {
          statement.run(record.id, record.revision, parent.candidateId, parent.revision, position)
        })
      }
      return result
    })
  }

  appendCandidateRound(input: CandidateRound): PersistenceWriteResult {
    const prepared = prepareRecord(candidateRoundSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM candidate_rounds WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO candidate_rounds (id, session_id, round_index, correlation_id, created_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.discoverySessionId,
              record.roundIndex,
              record.correlationId,
              record.createdAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      )
      if (result.outcome === 'INSERTED') {
        const statement = this.#sqlite.prepare(
          'INSERT INTO candidate_round_items (round_id, candidate_id, candidate_revision, position) VALUES (?, ?, ?, ?)',
        )
        record.candidates.forEach((candidate, position) => {
          statement.run(record.id, candidate.candidateId, candidate.revision, position)
        })
      }
      return result
    })
  }

  appendDiscoveryFeedback(input: DiscoveryFeedback): PersistenceWriteResult {
    const prepared = prepareRecord(discoveryFeedbackSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM discovery_feedback WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO discovery_feedback (id, session_id, round_id, intent, correlation_id, created_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.discoverySessionId,
              record.roundId,
              record.intent,
              record.correlationId,
              record.createdAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      )
      if (result.outcome === 'INSERTED' && record.intent === 'SELECT') {
        const selected = record.targets[0]
        if (selected === undefined) {
          throw new PersistenceError('VALIDATION_FAILED', 'Selection feedback has no target')
        }
        this.#sqlite
          .prepare(
            'INSERT INTO discovery_selections (session_id, feedback_id, candidate_id, candidate_revision, selected_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            record.discoverySessionId,
            record.id,
            selected.candidateId,
            selected.revision,
            record.createdAt,
          )
      }
      return result
    })
  }

  appendLearningSpec(input: LearningSpecRevision): PersistenceWriteResult {
    const prepared = prepareRecord(learningSpecRevisionSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM learning_spec_revisions WHERE spec_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM learning_specs WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO learning_specs (id, project_id, head_revision, status, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.revision,
              record.status,
              record.correlationId,
              record.updatedAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO learning_spec_revisions (spec_id, project_id, revision, status, candidate_id, candidate_revision, correlation_id, created_at, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.revision,
              record.status,
              record.selectedCandidate.candidateId,
              record.selectedCandidate.revision,
              record.correlationId,
              record.createdAt,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE learning_specs SET head_revision = ?, status = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(record.revision, record.status, record.correlationId, record.updatedAt, record.id)
        },
      }),
    )
  }

  appendTask(input: BuilderTask): PersistenceWriteResult {
    const prepared = prepareRecord(builderTaskSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM task_revisions WHERE task_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM tasks WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO tasks (id, project_id, spec_id, head_revision, sequence, status, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.learningSpecId,
              record.revision,
              record.sequence,
              record.status,
              record.correlationId,
              record.updatedAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO task_revisions (task_id, revision, project_id, spec_id, spec_revision, sequence, status, correlation_id, created_at, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.projectId,
              record.learningSpecId,
              record.learningSpecRevision,
              record.sequence,
              record.status,
              record.correlationId,
              record.createdAt,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE tasks SET head_revision = ?, sequence = ?, status = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(
              record.revision,
              record.sequence,
              record.status,
              record.correlationId,
              record.updatedAt,
              record.id,
            )
        },
      })
      if (result.outcome === 'INSERTED' && ['ACTIVE', 'BLOCKED'].includes(record.status)) {
        const current = this.#sqlite
          .prepare<[string], { readonly task_id: string }>(
            'SELECT task_id FROM project_active_tasks WHERE project_id = ?',
          )
          .get(record.projectId)
        if (current !== undefined && current.task_id !== record.id) {
          throw new PersistenceError(
            'STORAGE_CONFLICT',
            'Project already has a different active Task',
            record.projectId,
          )
        }
        this.#sqlite
          .prepare(
            `INSERT INTO project_active_tasks (project_id, task_id, task_revision, status, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(project_id) DO UPDATE SET
               task_revision = excluded.task_revision,
               status = excluded.status,
               updated_at = excluded.updated_at`,
          )
          .run(record.projectId, record.id, record.revision, record.status, record.updatedAt)
      } else if (result.outcome === 'INSERTED') {
        this.#sqlite
          .prepare('DELETE FROM project_active_tasks WHERE project_id = ? AND task_id = ?')
          .run(record.projectId, record.id)
      }
      return result
    })
  }

  appendLiveContext(input: LiveProjectContext): PersistenceWriteResult {
    const prepared = prepareRecord(liveProjectContextSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const existing = this.#payloadRow(
        'SELECT payload_json, payload_hash FROM live_context_versions WHERE context_id = ? AND context_version = ?',
        [record.id, record.contextVersion],
      )
      if (existing !== undefined) {
        return this.#duplicateOrConflict(
          record.id,
          record.contextVersion,
          prepared.payloadHash,
          existing,
        )
      }
      const head = this.#sqlite
        .prepare<[string], HeadVersionRow>('SELECT head_version FROM live_contexts WHERE id = ?')
        .get(record.id)
      if (head === undefined) {
        if (record.contextVersion !== 1 || record.expectedPreviousVersion !== 0) {
          throw new PersistenceError(
            'REVISION_CONFLICT',
            'First Live Context version must be 1',
            record.id,
          )
        }
        this.#sqlite
          .prepare(
            'INSERT INTO live_contexts (id, project_id, task_id, head_version, checkpoint, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            record.id,
            record.projectId,
            record.taskId,
            record.contextVersion,
            record.checkpoint,
            record.correlationId,
            record.updatedAt,
          )
      } else {
        if (
          record.expectedPreviousVersion !== head.head_version ||
          record.contextVersion !== head.head_version + 1
        ) {
          throw new PersistenceError(
            'REVISION_CONFLICT',
            'Live Context version does not follow the stored head',
            record.id,
          )
        }
      }
      this.#sqlite
        .prepare(
          'INSERT INTO live_context_versions (context_id, context_version, project_id, task_id, checkpoint, correlation_id, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          record.id,
          record.contextVersion,
          record.projectId,
          record.taskId,
          record.checkpoint,
          record.correlationId,
          record.updatedAt,
          prepared.payloadJson,
          prepared.payloadHash,
        )
      if (head !== undefined) {
        this.#sqlite
          .prepare(
            'UPDATE live_contexts SET head_version = ?, checkpoint = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
          )
          .run(
            record.contextVersion,
            record.checkpoint,
            record.correlationId,
            record.updatedAt,
            record.id,
          )
      }
      return inserted(record.id, record.contextVersion)
    })
  }

  appendDecisionRequest(input: DecisionRequest): PersistenceWriteResult {
    const prepared = prepareRecord(decisionRequestSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM decision_requests WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO decision_requests (id, project_id, task_id, context_version, category, correlation_id, requested_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.taskId,
              record.contextVersion,
              record.category,
              record.correlationId,
              record.requestedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      )
      if (result.outcome === 'INSERTED') {
        this.#sqlite
          .prepare(
            "INSERT INTO decision_states (decision_id, project_id, task_id, status, updated_at) VALUES (?, ?, ?, 'REQUESTED', ?)",
          )
          .run(record.id, record.projectId, record.taskId, record.requestedAt)
      }
      return result
    })
  }

  appendDecisionResolution(input: DecisionResolution): PersistenceWriteResult {
    const prepared = prepareRecord(decisionResolutionSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM decision_resolutions WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO decision_resolutions (id, decision_id, project_id, task_id, correlation_id, resolved_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.decisionId,
              record.projectId,
              record.taskId,
              record.correlationId,
              record.resolvedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      )
      if (result.outcome === 'INSERTED') {
        const update = this.#sqlite
          .prepare(
            "UPDATE decision_states SET status = 'RESOLVED', resolution_id = ?, updated_at = ? WHERE decision_id = ? AND project_id = ? AND task_id = ? AND status = 'REQUESTED'",
          )
          .run(record.id, record.resolvedAt, record.decisionId, record.projectId, record.taskId)
        if (update.changes !== 1) {
          throw new PersistenceError(
            'STORAGE_CONFLICT',
            'Decision is not pending or does not match the resolution',
            record.decisionId,
          )
        }
      }
      return result
    })
  }

  appendDecisionApplication(input: DecisionApplication): PersistenceWriteResult {
    const prepared = prepareRecord(decisionApplicationSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM decision_applications WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO decision_applications (id, decision_id, resolution_id, project_id, task_id, correlation_id, applied_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.decisionId,
              record.resolutionId,
              record.projectId,
              record.taskId,
              record.correlationId,
              record.appliedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      )
      if (result.outcome === 'INSERTED') {
        const update = this.#sqlite
          .prepare(
            "UPDATE decision_states SET status = 'APPLIED', application_id = ?, updated_at = ? WHERE decision_id = ? AND project_id = ? AND task_id = ? AND resolution_id = ? AND status = 'RESOLVED'",
          )
          .run(
            record.id,
            record.appliedAt,
            record.decisionId,
            record.projectId,
            record.taskId,
            record.resolutionId,
          )
        if (update.changes !== 1) {
          throw new PersistenceError(
            'STORAGE_CONFLICT',
            'Decision is not resolved or does not match the application',
            record.decisionId,
          )
        }
      }
      return result
    })
  }

  appendCompletionReport(input: TaskCompletionReport): PersistenceWriteResult {
    const prepared = prepareRecord(taskCompletionReportSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM completion_reports WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO completion_reports (id, project_id, task_id, expected_task_revision, correlation_id, completed_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.taskId,
              record.expectedTaskRevision,
              record.correlationId,
              record.completedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendActivityEvent(input: ActivityEvent): PersistenceWriteResult {
    const prepared = prepareRecord(activityEventSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM activity_events WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO activity_events (id, project_id, task_id, decision_id, sequence, event_type, correlation_id, occurred_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.taskId ?? null,
              record.decisionId ?? null,
              record.sequence,
              record.payload.type,
              record.correlationId,
              record.occurredAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendEpisode(input: Episode): PersistenceWriteResult {
    const prepared = prepareRecord(episodeSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const result = this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM episode_revisions WHERE episode_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM episodes WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO episodes (id, project_id, task_id, decision_id, head_revision, type, status, correlation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.taskId ?? null,
              record.decisionId ?? null,
              record.revision,
              record.type,
              record.status,
              record.correlationId,
              record.endedAt ?? record.startedAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO episode_revisions (episode_id, revision, project_id, type, status, correlation_id, started_at, ended_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.projectId,
              record.type,
              record.status,
              record.correlationId,
              record.startedAt,
              record.endedAt ?? null,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE episodes SET head_revision = ?, status = ?, correlation_id = ?, updated_at = ? WHERE id = ?',
            )
            .run(
              record.revision,
              record.status,
              record.correlationId,
              record.endedAt ?? record.startedAt,
              record.id,
            )
        },
      })
      if (result.outcome === 'INSERTED') {
        const statement = this.#sqlite.prepare(
          'INSERT INTO episode_event_edges (episode_id, episode_revision, event_id, position) VALUES (?, ?, ?, ?)',
        )
        record.eventIds.forEach((eventId, position) => {
          statement.run(record.id, record.revision, eventId, position)
        })
      }
      return result
    })
  }

  appendCanonicalConcept(input: CanonicalConcept): PersistenceWriteResult {
    const prepared = prepareRecord(canonicalConceptSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM canonical_concept_revisions WHERE concept_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM canonical_concepts WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO canonical_concepts (id, head_revision, canonical_name, updated_at) VALUES (?, ?, ?, ?)',
            )
            .run(record.id, record.revision, record.canonicalName, record.updatedAt)
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO canonical_concept_revisions (concept_id, revision, canonical_name, created_at, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.canonicalName,
              record.createdAt,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE canonical_concepts SET head_revision = ?, canonical_name = ?, updated_at = ? WHERE id = ?',
            )
            .run(record.revision, record.canonicalName, record.updatedAt, record.id)
        },
      }),
    )
  }

  appendConceptAliasProposal(input: ConceptAliasProposal): PersistenceWriteResult {
    const prepared = prepareRecord(conceptAliasProposalSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM concept_alias_proposals WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO concept_alias_proposals (id, concept_id, proposed_alias, status, correlation_id, proposed_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.canonicalConceptId ?? null,
              record.proposedAlias,
              record.status,
              record.correlationId,
              record.proposedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendEvidenceProposal(input: EvidenceProposal): PersistenceWriteResult {
    const prepared = prepareRecord(evidenceProposalSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM evidence_proposals WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO evidence_proposals (id, project_id, task_id, episode_id, concept_id, signal, strength, prompt_dependence, correlation_id, proposed_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.projectId,
              record.taskId ?? null,
              record.episodeId,
              record.concept.canonicalConceptId ?? null,
              record.signal,
              record.strength,
              record.promptDependence,
              record.correlationId,
              record.proposedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendEvidenceDecision(input: EvidenceDecision): PersistenceWriteResult {
    const prepared = prepareRecord(evidenceDecisionSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM evidence_decisions WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO evidence_decisions (id, proposal_id, outcome, reason_code, correlation_id, decided_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.evidenceProposalId,
              record.outcome,
              record.reasonCode,
              record.correlationId,
              record.decidedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendAcceptedEvidence(input: AcceptedEvidence): PersistenceWriteResult {
    const prepared = prepareRecord(acceptedEvidenceSchema, input)
    const record = prepared.record
    const proposalId = 'evidenceProposalId' in record ? record.evidenceProposalId : null
    const decisionId = 'evidenceDecisionId' in record ? record.evidenceDecisionId : null
    const episodeId = 'episodeId' in record ? record.episodeId : null
    const supportsState = 'supportsState' in record ? record.supportsState : null
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM accepted_evidence WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO accepted_evidence (id, kind, project_id, task_id, episode_id, concept_id, proposal_id, decision_id, supports_state, correlation_id, accepted_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.kind,
              record.projectId,
              record.taskId ?? null,
              episodeId,
              record.conceptId,
              proposalId,
              decisionId,
              supportsState,
              record.correlationId,
              record.acceptedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendMisconceptionIssue(input: MisconceptionIssue): PersistenceWriteResult {
    const prepared = prepareRecord(misconceptionIssueSchema, input)
    const record = prepared.record
    return this.#write(record.id, () => {
      const head = this.#sqlite
        .prepare<[string], IssueHeadRow>(
          'SELECT head_storage_revision FROM misconception_issues WHERE id = ?',
        )
        .get(record.id)
      if (head !== undefined) {
        const existing = this.#payloadRow(
          'SELECT payload_json, payload_hash FROM misconception_issue_history WHERE issue_id = ? AND storage_revision = ?',
          [record.id, head.head_storage_revision],
        )
        if (existing?.payload_hash === prepared.payloadHash) {
          return noOp(record.id, head.head_storage_revision)
        }
      }
      const storageRevision = (head?.head_storage_revision ?? 0) + 1
      const recordedAt = record.resolvedAt ?? record.openedAt
      if (head === undefined) {
        this.#sqlite
          .prepare(
            'INSERT INTO misconception_issues (id, concept_id, project_id, head_storage_revision, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            record.id,
            record.conceptId,
            record.projectId,
            storageRevision,
            record.status,
            recordedAt,
          )
      }
      this.#sqlite
        .prepare(
          'INSERT INTO misconception_issue_history (issue_id, storage_revision, concept_id, project_id, status, recorded_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          record.id,
          storageRevision,
          record.conceptId,
          record.projectId,
          record.status,
          recordedAt,
          prepared.payloadJson,
          prepared.payloadHash,
        )
      if (head !== undefined) {
        this.#sqlite
          .prepare(
            'UPDATE misconception_issues SET head_storage_revision = ?, status = ?, updated_at = ? WHERE id = ?',
          )
          .run(storageRevision, record.status, recordedAt, record.id)
      }
      return inserted(record.id, storageRevision)
    })
  }

  appendConceptLedger(input: ConceptLedgerEntry): PersistenceWriteResult {
    const prepared = prepareRecord(conceptLedgerEntrySchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendVersioned({
        recordId: record.id,
        revision: record.revision,
        prepared,
        existingSql:
          'SELECT payload_json, payload_hash FROM concept_ledger_revisions WHERE ledger_id = ? AND revision = ?',
        existingParams: [record.id, record.revision],
        headSql: 'SELECT head_revision FROM concept_ledgers WHERE id = ?',
        headParams: [record.id],
        insertStable: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO concept_ledgers (id, concept_id, head_revision, state, reducer_version, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.concept.id,
              record.revision,
              record.state.state,
              record.state.reducerVersion,
              record.updatedAt,
            )
        },
        insertHistory: () => {
          this.#sqlite
            .prepare(
              'INSERT INTO concept_ledger_revisions (ledger_id, revision, concept_id, state, reducer_version, updated_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.revision,
              record.concept.id,
              record.state.state,
              record.state.reducerVersion,
              record.updatedAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
        updateHead: () => {
          this.#sqlite
            .prepare(
              'UPDATE concept_ledgers SET head_revision = ?, state = ?, reducer_version = ?, updated_at = ? WHERE id = ?',
            )
            .run(
              record.revision,
              record.state.state,
              record.state.reducerVersion,
              record.updatedAt,
              record.id,
            )
        },
      }),
    )
  }

  appendAuditRecord(input: AuditRecord): PersistenceWriteResult {
    const prepared = prepareRecord(auditRecordSchema, input)
    const record = prepared.record
    return this.#write(record.id, () =>
      this.#appendImmutable(
        record.id,
        prepared,
        'SELECT payload_json, payload_hash FROM audit_records WHERE id = ?',
        [record.id],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO audit_records (id, resource_type, resource_id, resource_revision, action, outcome, correlation_id, occurred_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              record.id,
              record.resource.type,
              record.resource.id,
              record.resource.revision ?? null,
              record.action,
              record.outcome,
              record.correlationId,
              record.occurredAt,
              prepared.payloadJson,
              prepared.payloadHash,
            )
        },
      ),
    )
  }

  appendIdempotencyReceipt(input: IdempotencyReceipt): PersistenceWriteResult {
    if (
      !idempotencyKeySchema.safeParse(input.key).success ||
      !correlationIdSchema.safeParse(input.correlationId).success ||
      !stableEntityIdSchema.safeParse(input.resourceId).success ||
      !utcTimestampSchema.safeParse(input.recordedAt).success ||
      !/^[0-9a-f]{64}$/u.test(input.requestHash) ||
      !/^[0-9a-f]{64}$/u.test(input.responseHash) ||
      !this.#isCanonicalJson(input.responseJson) ||
      this.#hashForJson(input.responseJson) !== input.responseHash ||
      !/^[a-z][a-z0-9_.-]{0,79}$/u.test(input.operation) ||
      !Number.isInteger(input.resourceRevision) ||
      input.resourceRevision < 1
    ) {
      throw new PersistenceError(
        'VALIDATION_FAILED',
        'Idempotency receipt does not match its storage contract',
      )
    }
    const payloadJson = stableStringify(input)
    assertPayloadSafe(payloadJson)
    const payloadHash = this.#hashForJson(payloadJson)
    return this.#write(input.key, () =>
      this.#appendImmutable(
        input.key,
        { record: input, payloadJson, payloadHash },
        'SELECT payload_json, payload_hash FROM idempotency_receipts WHERE key = ?',
        [input.key],
        () => {
          this.#sqlite
            .prepare(
              'INSERT INTO idempotency_receipts (key, correlation_id, operation, resource_id, resource_revision, recorded_at, payload_json, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              input.key,
              input.correlationId,
              input.operation,
              input.resourceId,
              input.resourceRevision,
              input.recordedAt,
              payloadJson,
              payloadHash,
            )
        },
      ),
    )
  }

  readDiscoveryAggregate(
    projectId: string,
    discoverySessionId?: string,
  ): DiscoveryAggregate | null {
    if (
      !projectSchema.shape.id.safeParse(projectId).success ||
      (discoverySessionId !== undefined &&
        !discoverySessionSchema.shape.id.safeParse(discoverySessionId).success)
    ) {
      throw new PersistenceError('VALIDATION_FAILED', 'Discovery aggregate identity is invalid')
    }
    return this.#read(() => {
      const project = this.#projectHead(projectId)
      if (project === null) return null
      const session =
        discoverySessionId === undefined
          ? this.#headRecord(
              `SELECT revisions.payload_json, revisions.payload_hash
               FROM discovery_sessions heads
               JOIN discovery_session_revisions revisions
                 ON revisions.session_id = heads.id AND revisions.revision = heads.head_revision
               WHERE heads.project_id = ?
               ORDER BY heads.updated_at DESC LIMIT 1`,
              [projectId],
              discoverySessionSchema,
            )
          : this.#headRecord(
              `SELECT revisions.payload_json, revisions.payload_hash
               FROM discovery_sessions heads
               JOIN discovery_session_revisions revisions
                 ON revisions.session_id = heads.id AND revisions.revision = heads.head_revision
               WHERE heads.project_id = ? AND heads.id = ?`,
              [projectId, discoverySessionId],
              discoverySessionSchema,
            )
      if (session === null) return null

      const rounds = this.#recordList(
        'SELECT payload_json, payload_hash FROM candidate_rounds WHERE session_id = ? ORDER BY round_index ASC',
        [session.id],
        candidateRoundSchema,
      )
      const candidates = this.#recordList(
        'SELECT payload_json, payload_hash FROM candidate_revisions WHERE session_id = ? ORDER BY candidate_id ASC, revision ASC',
        [session.id],
        projectCandidateRevisionSchema,
      )
      const feedback = this.#recordList(
        'SELECT payload_json, payload_hash FROM discovery_feedback WHERE session_id = ? ORDER BY created_at ASC',
        [session.id],
        discoveryFeedbackSchema,
      )
      const learningSpecs = this.#recordList(
        'SELECT payload_json, payload_hash FROM learning_spec_revisions WHERE project_id = ? ORDER BY spec_id ASC, revision ASC',
        [projectId],
        learningSpecRevisionSchema,
      )
      const relevantLedgerEntries = this.#allLedgerHeads()
        .filter((entry) => entry.relatedProjectIds.includes(projectId))
        .slice(0, 20)
      return {
        project,
        session,
        rounds,
        candidates,
        feedback,
        learningSpecs,
        relevantLedgerEntries,
      }
    })
  }

  readDiscoveryAggregateBySession(discoverySessionId: string): DiscoveryAggregate | null {
    if (!discoverySessionSchema.shape.id.safeParse(discoverySessionId).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Discovery session identity is invalid')
    }
    return this.#read(() => {
      const owner = this.#sqlite
        .prepare<[string], ProjectIdentityRow>(
          'SELECT project_id FROM discovery_sessions WHERE id = ?',
        )
        .get(discoverySessionId)
      return owner === undefined
        ? null
        : this.readDiscoveryAggregate(owner.project_id, discoverySessionId)
    })
  }

  readBuilderTaskAggregate(projectId: string, taskId: string): BuilderTaskAggregate | null {
    if (
      !projectSchema.shape.id.safeParse(projectId).success ||
      !builderTaskSchema.shape.id.safeParse(taskId).success
    ) {
      throw new PersistenceError('VALIDATION_FAILED', 'Builder aggregate identity is invalid')
    }
    return this.#read(() => {
      const project = this.#projectHead(projectId)
      if (project === null) return null
      const task = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM tasks heads
         JOIN task_revisions revisions
           ON revisions.task_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.project_id = ? AND heads.id = ?`,
        [projectId, taskId],
        builderTaskSchema,
      )
      if (task === null) return null
      const learningSpec = this.#headRecord(
        `SELECT payload_json, payload_hash FROM learning_spec_revisions
         WHERE project_id = ? AND spec_id = ? AND revision = ?`,
        [projectId, task.learningSpecId, task.learningSpecRevision],
        learningSpecRevisionSchema,
      )
      if (learningSpec === null) {
        throw new PersistenceError('CORRUPT_DATABASE', 'Builder Task references a missing Spec')
      }
      const liveContext = this.#headRecord(
        `SELECT versions.payload_json, versions.payload_hash
         FROM live_contexts heads
         JOIN live_context_versions versions
           ON versions.context_id = heads.id AND versions.context_version = heads.head_version
         WHERE heads.project_id = ? AND heads.task_id = ?`,
        [projectId, taskId],
        liveProjectContextSchema,
      )
      const decisionRequests = this.#recordList(
        'SELECT payload_json, payload_hash FROM decision_requests WHERE project_id = ? AND task_id = ? ORDER BY requested_at ASC',
        [projectId, taskId],
        decisionRequestSchema,
      )
      const decisionResolutions = this.#recordList(
        `SELECT resolutions.payload_json, resolutions.payload_hash
         FROM decision_resolutions resolutions
         JOIN decision_requests requests ON requests.id = resolutions.decision_id
         WHERE requests.project_id = ? AND requests.task_id = ? ORDER BY resolutions.resolved_at ASC`,
        [projectId, taskId],
        decisionResolutionSchema,
      )
      const decisionApplications = this.#recordList(
        `SELECT applications.payload_json, applications.payload_hash
         FROM decision_applications applications
         JOIN decision_requests requests ON requests.id = applications.decision_id
         WHERE requests.project_id = ? AND requests.task_id = ? ORDER BY applications.applied_at ASC`,
        [projectId, taskId],
        decisionApplicationSchema,
      )
      const completionReport = this.#headRecord(
        'SELECT payload_json, payload_hash FROM completion_reports WHERE project_id = ? AND task_id = ? ORDER BY completed_at DESC LIMIT 1',
        [projectId, taskId],
        taskCompletionReportSchema,
      )
      return {
        project,
        learningSpec,
        task,
        liveContext,
        decisionRequests,
        decisionResolutions,
        decisionApplications,
        completionReport,
      }
    })
  }

  readEpisodeAggregate(projectId: string, episodeId: string): EpisodeAggregate | null {
    if (
      !projectSchema.shape.id.safeParse(projectId).success ||
      !episodeSchema.shape.id.safeParse(episodeId).success
    ) {
      throw new PersistenceError('VALIDATION_FAILED', 'Episode aggregate identity is invalid')
    }
    return this.#read(() => {
      const episode = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM episodes heads
         JOIN episode_revisions revisions
           ON revisions.episode_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.project_id = ? AND heads.id = ?`,
        [projectId, episodeId],
        episodeSchema,
      )
      if (episode === null) return null
      const events = this.#recordList(
        `SELECT events.payload_json, events.payload_hash
         FROM episode_event_edges edges
         JOIN activity_events events ON events.id = edges.event_id
         WHERE edges.episode_id = ? AND edges.episode_revision = ?
         ORDER BY edges.position ASC`,
        [episode.id, episode.revision],
        activityEventSchema,
      )
      const conceptIds = new Set(
        episode.conceptCandidates.flatMap((candidate) =>
          candidate.conceptId === undefined ? [] : [candidate.conceptId],
        ),
      )
      const conceptNames = new Set(
        episode.conceptCandidates.map((candidate) => candidate.originalExpression.toLowerCase()),
      )
      const relevantLedgerEntries = this.#allLedgerHeads()
        .filter(
          (entry) =>
            conceptIds.has(entry.concept.id) ||
            conceptNames.has(entry.concept.canonicalName.toLowerCase()) ||
            entry.acceptedAliases.some((alias) => conceptNames.has(alias.toLowerCase())),
        )
        .slice(0, 20)
      const evidenceProposals = this.#recordList(
        'SELECT payload_json, payload_hash FROM evidence_proposals WHERE episode_id = ? ORDER BY proposed_at ASC',
        [episode.id],
        evidenceProposalSchema,
      )
      return { episode, events, relevantLedgerEntries, evidenceProposals }
    })
  }

  readCanonicalConceptById(conceptId: string): CanonicalConcept | null {
    if (!canonicalConceptSchema.shape.id.safeParse(conceptId).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Concept ID is invalid')
    }
    return this.#read(() => this.#conceptHead(conceptId))
  }

  readCanonicalConceptByName(canonicalName: string): CanonicalConcept | null {
    if (canonicalName.trim().length === 0 || canonicalName.length > 120) {
      throw new PersistenceError('VALIDATION_FAILED', 'Concept name is invalid')
    }
    return this.#read(() =>
      this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM canonical_concepts heads
         JOIN canonical_concept_revisions revisions
           ON revisions.concept_id = heads.id AND revisions.revision = heads.head_revision
         WHERE lower(heads.canonical_name) = lower(?) LIMIT 1`,
        [canonicalName.trim()],
        canonicalConceptSchema,
      ),
    )
  }

  readIdempotencyReceipt(key: string): IdempotencyReceipt | null {
    if (!idempotencyKeySchema.safeParse(key).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Idempotency key is invalid')
    }
    return this.#read(() => {
      const row = this.#payloadRow(
        'SELECT payload_json, payload_hash FROM idempotency_receipts WHERE key = ?',
        [key],
      )
      if (row === undefined) return null
      if (this.#hashForJson(row.payload_json) !== row.payload_hash) {
        throw new PersistenceError('CORRUPT_DATABASE', 'Stored idempotency receipt hash mismatch')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(row.payload_json)
      } catch {
        throw new PersistenceError('CORRUPT_DATABASE', 'Stored idempotency receipt is invalid')
      }
      if (!this.#isIdempotencyReceipt(parsed)) {
        throw new PersistenceError('CORRUPT_DATABASE', 'Stored idempotency receipt is invalid')
      }
      return parsed
    })
  }

  recoverProject(projectId: string): ProjectRecoveryState | null {
    if (!projectSchema.shape.id.safeParse(projectId).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Project ID is invalid')
    }
    return this.#read(() => {
      const project = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM projects heads
         JOIN project_revisions revisions
           ON revisions.project_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.id = ?`,
        [projectId],
        projectSchema,
      )
      if (project === null) {
        return null
      }
      const session = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM discovery_sessions heads
         JOIN discovery_session_revisions revisions
           ON revisions.session_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.project_id = ?
         ORDER BY heads.updated_at DESC LIMIT 1`,
        [projectId],
        discoverySessionSchema,
      )
      const selectedCandidate = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM discovery_selections selections
         JOIN candidate_revisions revisions
           ON revisions.candidate_id = selections.candidate_id
          AND revisions.revision = selections.candidate_revision
         JOIN discovery_sessions sessions ON sessions.id = selections.session_id
         WHERE sessions.project_id = ?
         ORDER BY selections.selected_at DESC LIMIT 1`,
        [projectId],
        projectCandidateRevisionSchema,
      )
      const learningSpec = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM learning_specs heads
         JOIN learning_spec_revisions revisions
           ON revisions.spec_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.project_id = ?
         ORDER BY heads.updated_at DESC LIMIT 1`,
        [projectId],
        learningSpecRevisionSchema,
      )
      const activeTask = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM project_active_tasks active
         JOIN tasks heads ON heads.id = active.task_id
         JOIN task_revisions revisions
           ON revisions.task_id = active.task_id AND revisions.revision = active.task_revision
         WHERE active.project_id = ?`,
        [projectId],
        builderTaskSchema,
      )
      const pendingDecisions = this.#recordList(
        `SELECT requests.payload_json, requests.payload_hash FROM decision_states states
         JOIN decision_requests requests ON requests.id = states.decision_id
         WHERE states.project_id = ? AND states.status = 'REQUESTED'
         ORDER BY requests.requested_at ASC`,
        [projectId],
        decisionRequestSchema,
      )
      const liveContext =
        activeTask === null
          ? null
          : this.#headRecord(
              `SELECT versions.payload_json, versions.payload_hash
               FROM live_contexts heads
               JOIN live_context_versions versions
                 ON versions.context_id = heads.id AND versions.context_version = heads.head_version
               WHERE heads.task_id = ?`,
              [activeTask.id],
              liveProjectContextSchema,
            )
      return {
        project,
        discoverySession: session,
        selectedCandidate,
        learningSpec,
        activeTask,
        pendingDecisions,
        liveContext,
      }
    })
  }

  readEvidenceTrace(conceptId: string): EvidenceTrace | null {
    if (!canonicalConceptSchema.shape.id.safeParse(conceptId).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Concept ID is invalid')
    }
    return this.#read(() => {
      const concept = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM canonical_concepts heads
         JOIN canonical_concept_revisions revisions
           ON revisions.concept_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.id = ?`,
        [conceptId],
        canonicalConceptSchema,
      )
      if (concept === null) {
        return null
      }
      const ledger = this.#headRecord(
        `SELECT revisions.payload_json, revisions.payload_hash
         FROM concept_ledgers heads
         JOIN concept_ledger_revisions revisions
           ON revisions.ledger_id = heads.id AND revisions.revision = heads.head_revision
         WHERE heads.concept_id = ?`,
        [conceptId],
        conceptLedgerEntrySchema,
      )
      const aliasProposals = this.#recordList(
        'SELECT payload_json, payload_hash FROM concept_alias_proposals WHERE concept_id = ? ORDER BY proposed_at ASC',
        [conceptId],
        conceptAliasProposalSchema,
      )
      const proposals = this.#recordList(
        'SELECT payload_json, payload_hash FROM evidence_proposals WHERE concept_id = ? ORDER BY proposed_at ASC',
        [conceptId],
        evidenceProposalSchema,
      )
      const decisions = this.#recordList(
        `SELECT decisions.payload_json, decisions.payload_hash
         FROM evidence_decisions decisions
         JOIN evidence_proposals proposals ON proposals.id = decisions.proposal_id
         WHERE proposals.concept_id = ? ORDER BY decisions.decided_at ASC`,
        [conceptId],
        evidenceDecisionSchema,
      )
      const acceptedEvidenceRecords = this.#recordList(
        'SELECT payload_json, payload_hash FROM accepted_evidence WHERE concept_id = ? ORDER BY accepted_at ASC',
        [conceptId],
        acceptedEvidenceSchema,
      )
      const misconceptionIssues = this.#recordList(
        `SELECT history.payload_json, history.payload_hash
         FROM misconception_issues heads
         JOIN misconception_issue_history history
           ON history.issue_id = heads.id
          AND history.storage_revision = heads.head_storage_revision
         WHERE heads.concept_id = ? ORDER BY heads.updated_at ASC`,
        [conceptId],
        misconceptionIssueSchema,
      )
      const resourceIds = [
        concept.id,
        ...(ledger === null ? [] : [ledger.id]),
        ...aliasProposals.map((record) => record.id),
        ...proposals.map((record) => record.id),
        ...decisions.map((record) => record.id),
        ...acceptedEvidenceRecords.map((record) => record.id),
        ...misconceptionIssues.map((record) => record.id),
      ]
      const placeholders = resourceIds.map(() => '?').join(', ')
      const auditRecordsForTrace = this.#recordList(
        `SELECT payload_json, payload_hash FROM audit_records
         WHERE resource_id IN (${placeholders}) ORDER BY occurred_at ASC`,
        resourceIds,
        auditRecordSchema,
      )
      return {
        concept,
        ledger,
        aliasProposals,
        proposals,
        decisions,
        acceptedEvidence: acceptedEvidenceRecords,
        misconceptionIssues,
        auditRecords: auditRecordsForTrace,
      }
    })
  }

  readEvidenceTracesForProject(projectId: string): readonly EvidenceTrace[] {
    if (!projectSchema.shape.id.safeParse(projectId).success) {
      throw new PersistenceError('VALIDATION_FAILED', 'Project ID is invalid')
    }
    return this.#read(() => {
      const rows = this.#sqlite
        .prepare<[string, string], { readonly concept_id: string }>(
          `SELECT DISTINCT concept_id FROM accepted_evidence WHERE project_id = ?
           UNION SELECT DISTINCT concept_id FROM evidence_proposals
             WHERE project_id = ? AND concept_id IS NOT NULL
           ORDER BY concept_id ASC`,
        )
        .all(projectId, projectId)
      return rows.flatMap((row) => {
        const trace = this.readEvidenceTrace(row.concept_id)
        return trace === null ? [] : [trace]
      })
    })
  }

  #projectHead(projectId: string): Project | null {
    return this.#headRecord(
      `SELECT revisions.payload_json, revisions.payload_hash
       FROM projects heads
       JOIN project_revisions revisions
         ON revisions.project_id = heads.id AND revisions.revision = heads.head_revision
       WHERE heads.id = ?`,
      [projectId],
      projectSchema,
    )
  }

  #conceptHead(conceptId: string): CanonicalConcept | null {
    return this.#headRecord(
      `SELECT revisions.payload_json, revisions.payload_hash
       FROM canonical_concepts heads
       JOIN canonical_concept_revisions revisions
         ON revisions.concept_id = heads.id AND revisions.revision = heads.head_revision
       WHERE heads.id = ?`,
      [conceptId],
      canonicalConceptSchema,
    )
  }

  #allLedgerHeads(): readonly ConceptLedgerEntry[] {
    return this.#recordList(
      `SELECT revisions.payload_json, revisions.payload_hash
       FROM concept_ledgers heads
       JOIN concept_ledger_revisions revisions
         ON revisions.ledger_id = heads.id AND revisions.revision = heads.head_revision
       ORDER BY revisions.updated_at DESC`,
      [],
      conceptLedgerEntrySchema,
    )
  }

  #isIdempotencyReceipt(value: unknown): value is IdempotencyReceipt {
    if (typeof value !== 'object' || value === null) return false
    const receipt = value as Partial<IdempotencyReceipt>
    return (
      idempotencyKeySchema.safeParse(receipt.key).success &&
      correlationIdSchema.safeParse(receipt.correlationId).success &&
      typeof receipt.operation === 'string' &&
      /^[a-z][a-z0-9_.-]{0,79}$/u.test(receipt.operation) &&
      typeof receipt.requestHash === 'string' &&
      /^[0-9a-f]{64}$/u.test(receipt.requestHash) &&
      typeof receipt.responseJson === 'string' &&
      this.#isCanonicalJson(receipt.responseJson) &&
      typeof receipt.responseHash === 'string' &&
      /^[0-9a-f]{64}$/u.test(receipt.responseHash) &&
      this.#hashForJson(receipt.responseJson) === receipt.responseHash &&
      stableEntityIdSchema.safeParse(receipt.resourceId).success &&
      Number.isInteger(receipt.resourceRevision) &&
      (receipt.resourceRevision ?? 0) >= 1 &&
      utcTimestampSchema.safeParse(receipt.recordedAt).success
    )
  }

  #appendVersioned<T>(options: VersionedAppendOptions<T>): PersistenceWriteResult {
    const existing = this.#payloadRow(options.existingSql, options.existingParams)
    if (existing !== undefined) {
      return this.#duplicateOrConflict(
        options.recordId,
        options.revision,
        options.prepared.payloadHash,
        existing,
      )
    }
    const head = this.#sqlite
      .prepare<unknown[], HeadRow>(options.headSql)
      .get(...options.headParams)
    if (head === undefined) {
      if (options.revision !== 1) {
        throw new PersistenceError(
          'REVISION_CONFLICT',
          'First stored revision must be 1',
          options.recordId,
        )
      }
      options.insertStable()
    } else if (options.revision !== head.head_revision + 1) {
      throw new PersistenceError(
        'REVISION_CONFLICT',
        'Revision does not immediately follow the stored head',
        options.recordId,
      )
    }
    options.insertHistory()
    if (head !== undefined) {
      options.updateHead()
    }
    return inserted(options.recordId, options.revision)
  }

  #appendImmutable<T>(
    recordId: string,
    prepared: PreparedRecord<T>,
    existingSql: string,
    existingParams: readonly unknown[],
    insertRecord: () => void,
  ): PersistenceWriteResult {
    const existing = this.#payloadRow(existingSql, existingParams)
    if (existing !== undefined) {
      return this.#duplicateOrConflict(recordId, undefined, prepared.payloadHash, existing)
    }
    insertRecord()
    return inserted(recordId)
  }

  #duplicateOrConflict(
    recordId: string,
    revision: number | undefined,
    payloadHash: string,
    existing: PayloadRow,
  ): PersistenceWriteResult {
    if (existing.payload_hash === payloadHash) {
      return noOp(recordId, revision)
    }
    throw new PersistenceError(
      revision === undefined ? 'STORAGE_CONFLICT' : 'REVISION_CONFLICT',
      'A different record already exists at the requested identity',
      recordId,
    )
  }

  #payloadRow(sql: string, params: readonly unknown[]): PayloadRow | undefined {
    return this.#sqlite.prepare<unknown[], PayloadRow>(sql).get(...params)
  }

  #headRecord<T>(sql: string, params: readonly unknown[], schema: ContractSchema<T>): T | null {
    const row = this.#sqlite.prepare<unknown[], PayloadRow>(sql).get(...params)
    return row === undefined ? null : parseStoredRecord(schema, row.payload_json, row.payload_hash)
  }

  #recordList<T>(sql: string, params: readonly unknown[], schema: ContractSchema<T>): readonly T[] {
    return this.#sqlite
      .prepare<unknown[], PayloadRow>(sql)
      .all(...params)
      .map((row) => parseStoredRecord(schema, row.payload_json, row.payload_hash))
  }

  #hashForJson(payloadJson: string): string {
    return createHash('sha256').update(payloadJson).digest('hex')
  }

  #isCanonicalJson(payloadJson: string): boolean {
    try {
      return stableStringify(JSON.parse(payloadJson)) === payloadJson
    } catch {
      return false
    }
  }

  #write<T>(resourceId: string, work: () => T): T {
    this.#assertOpen()
    try {
      return this.#sqlite.transaction(work)()
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error
      }
      throw new PersistenceError('STORAGE_CONFLICT', 'SQLite write was rejected', resourceId)
    }
  }

  #read<T>(work: () => T): T {
    this.#assertOpen()
    try {
      return work()
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error
      }
      throw new PersistenceError('CORRUPT_DATABASE', 'SQLite read failed integrity validation')
    }
  }

  #assertOpen(): void {
    if (!this.#sqlite.open) {
      throw new PersistenceError('STORAGE_CLOSED', 'SQLite storage is closed')
    }
  }
}
import { createHash } from 'node:crypto'
