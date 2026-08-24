import path from "node:path";

import {
  readState,
  resetState,
  resolveDecision,
  resolveProbeStateFile,
} from "./core-state.mjs";

const args = process.argv.slice(2);
const action = args[0];
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const workspace = path.resolve(import.meta.dirname, "../s4-workspace");
const relativeStateFile = valueAfter("--state-file") ?? ".probe-state/state.json";
const stateFile = resolveProbeStateFile(relativeStateFile, workspace);

let result;
if (action === "reset") {
  result = await resetState(stateFile);
} else if (action === "show") {
  result = await readState(stateFile);
} else if (action === "resolve") {
  const expectedRevision = Number(valueAfter("--expected-revision"));
  result = await resolveDecision(stateFile, {
    expectedRevision,
    decisionId: valueAfter("--decision-id"),
    selectedOptionId: valueAfter("--selected-option-id"),
  });
} else {
  throw new Error("action must be reset, show, or resolve");
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
