import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  createDecision,
  publishContext,
  readState,
  resolveProbeStateFile,
} from "./core-state.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const role = valueAfter("--role");
if (role !== "builder" && role !== "helper") {
  throw new Error("--role must be builder or helper");
}
const stateFile = resolveProbeStateFile(valueAfter("--state-file"));

const textResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
});

const decisionIdSchema = z.string().regex(/^decision-[a-z0-9-]{1,48}$/);
const correlationIdSchema = z.string().regex(/^corr-[a-z0-9-]{1,48}$/);

function registerReadTools(server) {
  server.registerTool(
    "probe_get_context",
    {
      title: "Read synthetic live context",
      description: "Read the bounded S4 project/task context and current revision.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const state = await readState(stateFile);
      return textResult({
        projectId: state.projectId,
        taskId: state.taskId,
        revision: state.revision,
        liveContext: state.liveContext,
      });
    },
  );

  server.registerTool(
    "probe_get_decision",
    {
      title: "Read synthetic Decision",
      description: "Read one bounded Decision without resolving or mutating it.",
      inputSchema: z.object({ decisionId: decisionIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ decisionId }) => {
      const state = await readState(stateFile);
      const decision = state.decisions[decisionId];
      if (!decision) throw new Error(`DECISION_NOT_FOUND ${decisionId}`);
      return textResult({ revision: state.revision, decision });
    },
  );
}

function buildServer() {
  const server = new McpServer({
    name: `vibe-helper-${role}-core-probe`,
    version: "0.0.1",
  });

  registerReadTools(server);

  if (role === "helper") {
    server.registerTool(
      "probe_check_context_freshness",
      {
        title: "Check synthetic context freshness",
        description: "Compare an observed revision with Core without changing state.",
        inputSchema: z.object({ observedRevision: z.int().nonnegative() }),
        annotations: { readOnlyHint: true },
      },
      async ({ observedRevision }) => {
        const state = await readState(stateFile);
        return textResult({
          observedRevision,
          currentRevision: state.revision,
          stale: observedRevision !== state.revision,
        });
      },
    );
    return server;
  }

  server.registerTool(
    "probe_publish_context",
    {
      title: "Publish bounded synthetic context",
      description: "Update only the S4 synthetic live context using optimistic revision control.",
      inputSchema: z.object({
        expectedRevision: z.int().nonnegative(),
        summary: z.string().min(1).max(240),
        currentTask: z.string().min(1).max(120),
        activeConcepts: z.array(z.string().min(1).max(48)).max(8),
      }),
    },
    async (input) => {
      const state = await publishContext(stateFile, input);
      return textResult({ revision: state.revision, liveContext: state.liveContext });
    },
  );

  server.registerTool(
    "probe_create_decision",
    {
      title: "Create bounded synthetic Decision",
      description: "Create a pending S4 Decision; this tool cannot resolve it.",
      inputSchema: z.object({
        expectedRevision: z.int().nonnegative(),
        decisionId: decisionIdSchema,
        correlationId: correlationIdSchema,
        question: z.string().min(1).max(240),
        options: z
          .array(
            z.object({
              id: z.string().regex(/^option-[a-z0-9-]{1,32}$/),
              label: z.string().min(1).max(80),
            }),
          )
          .min(2)
          .max(4),
        recommendedOptionId: z.string().regex(/^option-[a-z0-9-]{1,32}$/),
      }),
    },
    async (input) => {
      const result = await createDecision(stateFile, input);
      return textResult({ revision: result.state.revision, decision: result.decision });
    },
  );

  server.registerTool(
    "probe_read_resolution",
    {
      title: "Read synthetic Decision resolution",
      description: "Read a Decision result created by the deterministic user-control path.",
      inputSchema: z.object({ decisionId: decisionIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ decisionId }) => {
      const state = await readState(stateFile);
      const decision = state.decisions[decisionId];
      if (!decision) throw new Error(`DECISION_NOT_FOUND ${decisionId}`);
      return textResult({ revision: state.revision, decision });
    },
  );

  return server;
}

serveStdio(buildServer, {
  legacy: "serve",
  onerror: (error) => process.stderr.write(`[probe-mcp] ${error.message}\n`),
});
