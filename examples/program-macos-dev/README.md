# Actual frontend, Mac development host

This is a verification harness, not a supported Mac release or a Windows package.
It bundles the separate program checkout's real provider and webview with the
existing attested Mac native worker. No mock adapter is used by this host.

Use the pinned Node 24.19.0 and pnpm 11.12.0. From the backend root:

```sh
pnpm panel:build
mktemp -d /private/tmp/vibe-helper-macos-core-XXXXXXXX
node scripts/prepare-program-macos-dev.mjs /absolute/program/checkout '' <printed-private-directory>
node apps/local-backend/dist/main.js init --root <printed-coreRoot>
VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1 node apps/local-backend/dist/main.js native --root <printed-coreRoot> --port 0
/Applications/Kiro.app/Contents/Resources/app/bin/code --new-window --extensionDevelopmentPath=<printed-extension> <printed-coreRoot>/workspaces
```

Pass the printed stage as a second argument to the prepare script to rebuild
the same generated extension without replacing its Core database. Only a stage
with a matching development receipt inside `.data/frontend-macos` is accepted.
Keep an old development window by using a new stage/extension path: the IDE can
reuse an existing development host even when `--new-window` is supplied with its
same extension path. Do not close user windows to work around that behavior.

For native Builder verification, its Core/workspaces must be outside any parent
package repository. Create an owned private directory using
`mktemp -d /private/tmp/vibe-helper-macos-core-XXXXXXXX`, then pass that exact
directory as the prepare script's third argument (after checkout and stage).
Initialize/start Core with this printed `coreRoot`. Rebuilds preserve that root
when the third argument is omitted; they never migrate or delete the old DB.
Ask for Trust on only `<coreRoot>/workspaces`, not `/private/tmp` or the Core root.

In this opt-in isolated mode the development extension applies a nonpersistent,
folder-scoped terminal PATH using VS Code's environment-variable collection.
It is applied at process creation and shell integration so shell rc files cannot
silently replace the pinned Node path. No Kiro profile, login, global settings or
shell rc file is changed. Canonical private root/one trusted contained folder are
required. Verify Node24.19.0 and pnpm11.12.0 in a **new actual IDE terminal** before
model calls; source inspection or a mock alone is not environment verification.
Ancestor package configuration still fails closed in the native shell guard.
This environment setup is not an OS sandbox or supported Mac product launcher.

The generated private config contains paths only. Core owns its private
connection descriptor. Nothing in that descriptor crosses the webview boundary.
The build copies frontend media and backend packaged runtime assets only to the
ignored development stage; it does not alter either product package.

The Mac Core must use the already attested single-window protected Helper/Analyst
mode shown above. The default native relay routes those roles to a separate
Helper workspace, whose automatic window launcher is Windows-only. Without the
flag, Discovery/Builder can work but Helper waits without a worker and fails
`NATIVE_IDE_WORKER_UNAVAILABLE`. Do not remove the read-only Helper permission
attestation or weaken the source pin to make a run pass. Change this process-local
flag only with all runs idle, then reconnect/reload this development window.

No model call is admitted without an explicit, fresh account observation in the
stage's `credit-observation.json`: `approved: true`, `cumulativeLimit: 900`,
`newCallCutoff: 880`, numeric `used < 880`, `overageEnabled: false`, and ISO
`observedAt` within 15 minutes. At most two UI admissions use one observation.
Do not fabricate or extend observations. Observe all follow-up Agent work and
recheck actual usage before the next phase. This guard is not a billing hard cap.

Discovery, Builder/Helper starts and explicit Evidence analysis retries share
the same allowance. Private `model-admissions.jsonl.<digest>.<slot>.claim` files
reserve slots with exclusive creation across hosts/processes; existing audit-log
admissions are also counted. A failed dispatch or process exit does not refund a
slot. Do not delete claims or rewrite timestamps to renew approval: inspect actual
account usage and create a genuinely new observation. Timestamp aliases cannot
renew an observation. Malformed, oversized, symlinked or unavailable metadata
fails closed. Only bounded request-kind/time/usage metadata is recorded; no
prompts, entity ids or credentials are logged.

Trust must be approved separately by the user. Restricted mode still supports
durable History reads. Do not broaden Trust to a parent folder or disable exact
runtime/installation checks. User windows, temporary data and account settings
must be preserved.

Model entry points check Trust independently of the budget receipt. The model-0
regressions exercise the real development entry with fake Core/native boundaries
and independent Node processes, not actual Kiro/LLM requests:

```sh
node --test examples/program-macos-dev/test/*.test.cjs
```

These tests intentionally retain synthetic temporary metadata. They do not create
an approval file in the active development stage or alter Workspace Trust.

See `docs/FRONTEND_MAC_PROGRESS_20260928.md` for verification boundaries and known
remaining gates. The old frontend Windows portable kit still needs Windows-side
refresh and verification; this harness does not certify it.
