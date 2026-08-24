import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { readState, resetState, resolveDecision } from "./core-state.mjs";

const workspace = path.resolve(import.meta.dirname, "../s4-workspace");
const server = path.resolve(import.meta.dirname, "server.mjs");
const stateFile = path.join(workspace, ".probe-state/state.json");

async function connect(role) {
  const client = new Client({ name: `s4-${role}-probe-client`, version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server, "--role", role, "--state-file", ".probe-state/state.json"],
    cwd: workspace,
    stderr: "pipe",
  });
  await client.connect(transport);
  return { client, transport };
}

const builderTools = [
  "probe_create_decision",
  "probe_get_context",
  "probe_get_decision",
  "probe_publish_context",
  "probe_read_resolution",
];
const helperTools = [
  "probe_check_context_freshness",
  "probe_get_context",
  "probe_get_decision",
];

await resetState(stateFile);
const builder = await connect("builder");
const helper = await connect("helper");

try {
  assert.deepEqual(
    (await builder.client.listTools()).tools.map((tool) => tool.name).sort(),
    builderTools,
  );
  assert.deepEqual(
    (await helper.client.listTools()).tools.map((tool) => tool.name).sort(),
    helperTools,
  );

  await builder.client.callTool({
    name: "probe_publish_context",
    arguments: {
      expectedRevision: 0,
      summary: "Builder is choosing how to store event registrations.",
      currentTask: "Choose the registration data shape",
      activeConcepts: ["database-model", "validation"],
    },
  });
  await builder.client.callTool({
    name: "probe_create_decision",
    arguments: {
      expectedRevision: 1,
      decisionId: "decision-registration-shape",
      correlationId: "corr-registration-shape",
      question: "Should one student be allowed to register once or multiple times?",
      options: [
        { id: "option-once", label: "Allow one registration per student" },
        { id: "option-many", label: "Allow repeated registrations" },
      ],
      recommendedOptionId: "option-once",
    },
  });

  const decisionRead = await helper.client.callTool({
    name: "probe_get_decision",
    arguments: { decisionId: "decision-registration-shape" },
  });
  assert.equal(decisionRead.structuredContent.decision.status, "pending");
  const freshness = await helper.client.callTool({
    name: "probe_check_context_freshness",
    arguments: { observedRevision: 1 },
  });
  assert.deepEqual(freshness.structuredContent, {
    observedRevision: 1,
    currentRevision: 2,
    stale: true,
  });

  const beforeDeniedMutation = await readState(stateFile);
  await assert.rejects(
    helper.client.callTool({
      name: "probe_publish_context",
      arguments: {
        expectedRevision: 2,
        summary: "This mutation must not run.",
        currentTask: "Forbidden",
        activeConcepts: [],
      },
    }),
    /Tool probe_publish_context not found/,
  );
  assert.deepEqual(await readState(stateFile), beforeDeniedMutation);

  const staleMutation = await builder.client.callTool({
      name: "probe_publish_context",
      arguments: {
        expectedRevision: 1,
        summary: "This stale mutation must not run.",
        currentTask: "Stale",
        activeConcepts: [],
      },
    });
  assert.equal(staleMutation.isError, true);
  assert.deepEqual(await readState(stateFile), beforeDeniedMutation);

  const resolved = await resolveDecision(stateFile, {
    expectedRevision: 2,
    decisionId: "decision-registration-shape",
    selectedOptionId: "option-once",
  });
  assert.equal(resolved.decision.correlationId, "corr-registration-shape");
  assert.equal(resolved.decision.status, "resolved");

  const resumed = await builder.client.callTool({
    name: "probe_read_resolution",
    arguments: { decisionId: "decision-registration-shape" },
  });
  assert.equal(resumed.structuredContent.revision, 3);
  assert.equal(resumed.structuredContent.decision.selectedOptionId, "option-once");

  process.stdout.write(
    `${JSON.stringify({
      result: "PASS",
      builderTools,
      helperTools,
      helperMutationDenied: true,
      staleMutationDenied: true,
      correlationId: "corr-registration-shape",
      finalRevision: 3,
    })}\n`,
  );
} finally {
  await Promise.allSettled([builder.client.close(), helper.client.close()]);
}
