# Reproducible fixture-suite benchmarks

Run from the repository root with credentials already supplied by Infisical.
Do not run another Leaf lab eval concurrently: the Eve runtime uses shared state.

```sh
bun apps/leaf-lab/scripts/suite.ts --dry-run --output "$HOME/.capy/work/leaf-lab-suites"
ENV_FILE=.env infisical run --env=dev --recursive -- \
  bun --env-file=.env apps/leaf-lab/scripts/suite.ts \
  --arms opus,jev --execution single --repeats 1 \
  --output "$HOME/.capy/work/leaf-lab-suites"
```

The runner executes every `*.eval.ts` under `apps/leaf/tests/evals`, sequentially,
including every case declared by each unchanged scenario. It inventories other
Leaf eval directories, excluding generated runtime snapshots and dependencies.
`apps/leaf/evals` uses native Eve `defineEval`, not the fixture harness, and is
listed separately rather than claimed as covered by this driver comparison.
There is no scenario filter. Use `--arms opus` to capture only the baseline;
`--arms jev` captures only the challenger. `--execution loop` explicitly selects
the older Jev tool-loop mode. Default single mode retains unsupported-case
failures instead of silently changing the workload or switching modes.

Each invocation inherits credentials without serializing the environment. Only
the explicit benchmark configuration overrides are written. Keep the output
private: fixture traces include prompts and model responses. Never commit these
artifacts. Every suite gets a unique child directory; repeated runs cannot replace
previous attempts. Failures do not stop later evals. There are no automatic
whole-eval retries; `--repeats N` records N independent attempts per arm and file.

Children run with `apps/leaf` as their working directory so unchanged contract
attachment fixtures resolve correctly. The suite saves its command, runtime version, Git HEAD, source-file SHA-256 hashes,
inventory, explicit child command/configuration, timestamps, exit/signal status,
separate stdout/stderr, harness `scores.json`, and all driver raw trace artifacts.
The lab source is copied into `frozen/apps/leaf-lab` before execution; the harness
must honor `LEAF_LAB_DRIVER_MODULE`. Eve then starts in that frozen lab directory.
Leaf fixtures, packages, shared code and installed dependencies remain symlinked
to the checkout, so do not modify those during a run. `source-final.json` records
shared-source drift and the suite exits nonzero when it detects drift or failed runs.
Live lab source edits do not change the frozen driver and are excluded from
shared-source drift. `frozen-source.json` hashes the actual snapshotted lab source;
fixture PDF hashes are included in the shared-source fingerprint.
Interrupted suites keep their last durable manifest with the active invocation
marked running; do not mistake that for completion. Do not start a second suite
until any interrupted child processes are stopped.

`report.md` provides invocation and per-case tables, with explicit active-panel
pass counts, declared expectation counts and inactive perfect-panel counts. The
expectation count counts declared expectation objects (or legacy list entries),
not every nested predicate inside them. Other/custom safety scorers are listed
separately instead of guessing their applicability. `report.json` preserves per-case scorer values/errors and every driver's measured
turns, proposal attempts and raw measurements, including failed/repaired attempts.
The headline initial-prompt-to-first-button metric uses the **first non-retained**
`approval_ready` event. A gate in the initial user turn uses its exact elapsed time.
If clarification requires another user reply before the first gate, only measured
`fromFirstPromptMs` qualifies as the initial-prompt total; this is scripted reply
wall time with no human waiting. Older multi-turn traces lacking that clock remain
unavailable, never replaced by the last reply's duration. User-input-required
cases are explicitly labeled. `cumulativeBackendApprovalReadyMs` retains the old
sum of last readiness timestamps across user turns, including retained confirmations;
it is not initial-prompt-to-first-button latency. All per-turn measurements remain
available. Process duration includes cold startup/scoring and is never used as
approval latency. No-approval observations remain null, explicitly distinguished
from post-approval turns; consult the raw input/error/trace to separate read-only
intent from failures. Driver reports join to scored cases only by exact
`metadata.caseId` (or `input.caseId`) matching the driver report's `name`; missing
IDs or failed setup never fall back to positional joins. No dollar cost is inferred from token counts.
Both failed and successful runs retain raw model/Jev usage for cost analysis.

Regenerate the machine-readable report without making model calls:

```sh
bun apps/leaf-lab/scripts/report.ts /absolute/path/to/suite-directory
cd apps/leaf-lab && bun test tests/suite.test.ts
```

The default harness timeout is explicitly set to 240000 ms per eval; override
`EVAL_TIMEOUT_MS` before launch if required and record the reason separately.
This does not add a process-kill timeout: evidence-producing cleanup is allowed
to finish. Neither dry-run nor report generation calls paid providers.

## Infrastructure cleanup and replay

After every child invocation, including evaluator timeout exits, the runner
checks for leftover `node <exact frozen lab>/node_modules/eve/bin/eve.js dev`
processes and their observed descendants. It sends TERM, then KILL only to those
same observed processes if still present, recording PIDs, signals and survivors
in `host-cleanup.json`. It never uses broad process-name matching. Surviving owned
processes stop the suite rather than contaminating the next case.

Host startup refusals such as “A dev server is already running” are labeled
`host-startup-infrastructure`; evaluator deadlines are `evaluator-timeout`.
Neither is model-accuracy evidence, even if the harness error handler produced
zero scorer panels. Their original logs, timings and costs remain intact.

To replay only the latest infrastructure-failed attempts from a completed suite:

```sh
bun apps/leaf-lab/scripts/suite.ts --resume-infra /absolute/suite-directory --dry-run
ENV_FILE=.env infisical run --env=dev --recursive -- \
  bun --env-file=.env apps/leaf-lab/scripts/suite.ts \
  --resume-infra /absolute/suite-directory
```

Replay verifies frozen lab hashes and shared dependency hashes, runs that exact
frozen eval launcher/driver with the original configuration and fixture cwd,
and appends uniquely named attempts with `retryOf` links. It does not replace
original invocation directories or retry assertion failures or evaluator
timeouts. A saved resume plan records the command and selected original IDs.
The dry run performs no process cleanup and makes no model calls. A replay lock
prevents concurrent replay against the same frozen runtime; after interruption,
inspect processes and the running manifest before manually recovering the lock.

## Before/after comparison

```sh
bun apps/leaf-lab/scripts/compare.ts \
  /absolute/before-suite /absolute/after-suite \
  "$HOME/.capy/work/leaf-lab-comparison"
```

Each side must contain one arm after filtering. For a corrected both-arms run:

```sh
SUITE_DIR=/absolute/path/to/corrected-both-arms/TIMESTAMP-UUID
bun apps/leaf-lab/scripts/compare.ts "$SUITE_DIR" "$SUITE_DIR" \
  "$SUITE_DIR/comparison-opus-vs-jev" --before-arm opus --after-arm jev
```

All selected-arm attempts remain included. Known corpus fingerprint mismatches
are rejected, including invocation fingerprints inconsistent with their suite.
Missing legacy provenance is labeled unknown and suppresses speedups rather than
claiming an identical corrected workload. Matching corpus fingerprints are
required in addition to passing case scores and matching timing bases.

This regenerates reports from saved artifacts,
without model calls, and writes `comparison.md`, `attempts.csv`, and
`comparison.json`. Cases match by exact case ID, eval path and repeat; all original
infrastructure attempts and replays remain in the attempt table and CSV. The
summary selects the latest attempt per side without hiding earlier costs.
Speedups are shown only when both cases pass their scorers, are accuracy-eligible,
and have matching first-ready measurement bases. Failed-score cases may have
observed gates, but are not latency successes. Different clarification requirements
are not silently compared as equal tasks. Read-only/no-gate cases have no approval
latency. Raw provider `usage.cost` values are summed across every captured request,
including failures and retries, without inferred token pricing. These are generative
provider costs only, not full system cost: Jev, scorer judges, and requests with
missing/uncaptured usage are excluded and that limitation is explicit.
