import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const PROJECT_ID = "project-s4-probe";
export const TASK_ID = "task-s4-probe";

export function initialState() {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    revision: 0,
    liveContext: {
      summary: "S4 synthetic context has not been published yet.",
      currentTask: "Await Builder context",
      activeConcepts: [],
      updatedBy: "deterministic-core",
    },
    decisions: {},
  };
}

export async function readState(stateFile) {
  try {
    return JSON.parse(await readFile(stateFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return initialState();
    throw error;
  }
}

async function writeState(stateFile, state) {
  const directory = path.dirname(stateFile);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.state-${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, stateFile);
}

function assertExpectedRevision(state, expectedRevision) {
  if (state.revision !== expectedRevision) {
    throw new Error(
      `STALE_CONTEXT expected revision ${expectedRevision}, current revision ${state.revision}`,
    );
  }
}

export async function resetState(stateFile) {
  const state = initialState();
  await writeState(stateFile, state);
  return state;
}

export async function publishContext(stateFile, input) {
  const state = await readState(stateFile);
  assertExpectedRevision(state, input.expectedRevision);
  const next = {
    ...state,
    revision: state.revision + 1,
    liveContext: {
      summary: input.summary,
      currentTask: input.currentTask,
      activeConcepts: [...input.activeConcepts],
      updatedBy: "builder",
    },
  };
  await writeState(stateFile, next);
  return next;
}

export async function createDecision(stateFile, input) {
  const state = await readState(stateFile);
  assertExpectedRevision(state, input.expectedRevision);
  if (state.decisions[input.decisionId]) {
    throw new Error(`DECISION_EXISTS ${input.decisionId}`);
  }
  if (!input.options.some((option) => option.id === input.recommendedOptionId)) {
    throw new Error("INVALID_RECOMMENDATION recommendedOptionId must name an option");
  }
  const nextRevision = state.revision + 1;
  const decision = {
    decisionId: input.decisionId,
    correlationId: input.correlationId,
    question: input.question,
    options: input.options.map((option) => ({ ...option })),
    recommendedOptionId: input.recommendedOptionId,
    status: "pending",
    selectedOptionId: null,
    contextRevision: state.revision,
    createdRevision: nextRevision,
    resolvedRevision: null,
  };
  const next = {
    ...state,
    revision: nextRevision,
    decisions: { ...state.decisions, [decision.decisionId]: decision },
  };
  await writeState(stateFile, next);
  return { state: next, decision };
}

export async function resolveDecision(stateFile, input) {
  const state = await readState(stateFile);
  assertExpectedRevision(state, input.expectedRevision);
  const decision = state.decisions[input.decisionId];
  if (!decision) throw new Error(`DECISION_NOT_FOUND ${input.decisionId}`);
  if (decision.status !== "pending") {
    throw new Error(`DECISION_NOT_PENDING ${input.decisionId}`);
  }
  if (!decision.options.some((option) => option.id === input.selectedOptionId)) {
    throw new Error(`OPTION_NOT_FOUND ${input.selectedOptionId}`);
  }
  const nextRevision = state.revision + 1;
  const resolved = {
    ...decision,
    status: "resolved",
    selectedOptionId: input.selectedOptionId,
    resolvedRevision: nextRevision,
  };
  const next = {
    ...state,
    revision: nextRevision,
    decisions: { ...state.decisions, [decision.decisionId]: resolved },
  };
  await writeState(stateFile, next);
  return { state: next, decision: resolved };
}

export function resolveProbeStateFile(rawPath, cwd = process.cwd()) {
  if (!rawPath || path.isAbsolute(rawPath)) {
    throw new Error("--state-file must be a relative path inside .probe-state");
  }
  const normalized = path.normalize(rawPath);
  const allowedRoot = path.resolve(cwd, ".probe-state");
  const candidate = path.resolve(cwd, normalized);
  if (candidate !== allowedRoot && !candidate.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("--state-file escapes the bounded .probe-state directory");
  }
  return candidate;
}
