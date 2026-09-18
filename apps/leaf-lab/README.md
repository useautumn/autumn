# Leaf lab

Headless Eve experiments compare Opus-only with Jev-guided Flash Nitro against
Leaf's fixture-backed billing scenarios. They use a local MCP server and in-memory
Autumn API mock, not production billing, Stripe, Slack, or a database. Provider
model calls still incur real costs. This is an experimental executor, not a
production Leaf replacement.

## Run and preserve evidence

Run the fixture suite from the repository root with Bun and Node on `PATH`, after
authorizing provider spend:

```sh
bun apps/leaf-lab/scripts/suite.ts --dry-run --arms opus,jev
ENV_FILE=.env infisical run --env=dev --recursive -- \
  bun --env-file=.env apps/leaf-lab/scripts/suite.ts \
  --arms opus,jev --execution single \
  --output "$HOME/.capy/work/leaf-lab-suites"
```

The suite inventories all 20 fixture `*.eval.ts` files and runs every declared
case, sequentially. Children run from `apps/leaf` so original contract paths
resolve. Do not launch another evaluation against the same frozen runtime.
Each suite snapshots lab source and hashes shared sources and PDF fixtures;
credentials are inherited, never serialized. Before each paid invocation it
checks for shared-source drift and stops rather than running the next arm on
different fixtures. It preserves commands, safe configuration overrides,
stdout/stderr, scores, traces, provider requests/SSE/timings, source hashes and
cleanup evidence outside Git. Failure does not erase an attempt or its cost.

For a single fixture scenario, use the fixture working directory explicitly:

```sh
cd apps/leaf
ENV_FILE=../../.env infisical run --env=dev --recursive -- \
  bun --env-file=../../.env ../leaf-lab/scripts/eval.ts \
  agent/mcp/attach-approval.eval.ts
```

`OPENROUTER_API_KEY` is required; Jev also needs `TYPESAFE_API_KEY`.
`BRAINTRUST_API_KEY` enables remote experiment logging. Some unchanged scorers
make their own judge calls and require their provider credentials. Store keys
in ignored environment files or Infisical. Reports contain prompts/documents and
must be kept private even though credential environment variables are not saved.

| Variable | Default / purpose |
| --- | --- |
| `LEAF_LAB_MODE` | `jev`; alternatives `flash` and `opus` |
| `LEAF_LAB_EXECUTION` | `single` for Jev structured planning; `loop` selects the older Jev tool loop. Flash/Opus use the loop. |
| `LEAF_LAB_JEV_MODEL` | `jev-latest` |
| `LEAF_LAB_REPORT_DIR` | Per-invocation artifact directory; standalone default is `~/.capy/work/leaf-lab` |
| `LEAF_LAB_SCORES_FILE` | Local complete scorer result artifact, written before score assertions |
| `LEAF_LAB_DRIVER_MODULE` | Suite-selected frozen driver module |
| `EVAL_TIMEOUT_MS` | Suite sets `240000`; explicit scenario timeouts can override it. |

Models are `anthropic/claude-opus-5` and
`google/gemini-3.8-flash:nitro` through OpenRouter. Nitro is a throughput-oriented
routing preference, not a guarantee of prompt-to-approval latency.

## Original versus corrected fixture provenance

Historical original-suite results remain original evidence, including failures.
Approved corrections to fixture units, mocked responses and schedule expectations
are a **different evaluation corpus**, not the unchanged original workload.
Rerun both arms against the same corrected corpus before drawing corrected-suite
comparisons. Do not combine original Opus scores with corrected Jev scores as a
matched accuracy comparison.

For a corrected run, add all four provenance arguments to the suite command:

```sh
--corpus corrected \
--corrections-file /absolute/path/to/FIXTURE_CORRECTIONS.md \
--original-source-archive /absolute/path/to/original-eval-source.tar.gz \
--original-source-sha256 ORIGINAL_ARCHIVE_SHA256
```

The runner verifies the archive's SHA-256, saves a hashed copy of the correction
document, and records the corrected corpus fingerprint in the manifest,
`corpus-provenance.json`, invocation metadata and report. Original archives are
references, not silently substituted inputs. `--corpus original` is a descriptive
label; hashes, not labels, establish equivalence. Unlabeled older runs must be
identified using their saved `source.json`. See [benchmark instructions](docs/benchmarks.md)
for artifact layout and infrastructure-only replay.

## Dynamic structured execution

Jev selects needed operations and skills from real tool metadata using the full
conversation, source document text, pending actions and completed results. Context
preparation reads authoritative rules, catalog/customer/entity/subscription state.
Flash receives dynamically assembled request schemas for selected supported
operations, not an attach-only template or hard-coded scenario IDs. Supported
operations include attach, subscription updates/cancellation, schedules, customer
updates, customer creation and entity creation. Read-only answers and genuine
clarifications are explicit structured outcomes.

The executor validates proposals against the real MCP schemas and policy checks,
checks authoritative request identities/economics, and runs required previews
alongside Jev verification. Required scope, price or identity clarification stops
proposal creation. Pending questions/confirmations can retain an existing request;
changes replace it rather than executing stale inputs. Verification thresholds
remain experimental, not calibrated production safety guarantees.

Billing actions are queued with **sequential per-write approvals**. A successful
explicit approval executes that immutable request against the mock after exact
preview matching. Remaining actions refresh context and require their own approval.
Customer/entity provisioning has separate verified, non-billing setup handling and
can execute before the billing gate. Receipts contain actual mock execution results;
there is no extra generative receipt pass in structured mode.

Structured generation permits up to **three Eve model steps per attempt** and
**two proposal attempts per user turn**, including one repair. This is not a
promise of one model call or a one-operation conversation. Model-driven Autumn
tool execution is disabled in structured mode; the executor owns its reads,
previews and mutations. Loop mode has a 40-call tool budget, three proposal limit,
12 model steps per turn and 120-second Eve-request deadline. Delegation,
shell/file/web/todo/framework-question tools are disabled.

Relative schedule dates are resolved through the real API's timing helper at the
preparation timestamp, before verification and preview. The same numeric request
is then approved and executed. Explicit user date strings receive UTC arithmetic
references without overriding requested timezones. Finite item allowances and
purchase limits materialize the API mapper's equivalent defaults (`unlimited:
false`, `max_purchase: null`) before approval; explicit supplied values are preserved.
Unambiguous literal user base prices also receive an exact numeric check. That
check abstains on ambiguous or calculated prices and never replaces semantic review.

Text and actual PDF bytes are supported. PDF extraction runs before planning;
the original bytes, SHA-256 and extracted text are retained. Unsupported attachment
types or PDFs without extractable text fail rather than being silently ignored;
OCR is not implemented. Documents are source evidence, not privileged instructions.

## Native Eve adapter

The separate [native adapter](native/README.md) runs 13 native cases in a modeled
sandbox org. Twelve re-export original `apps/leaf/evals` definitions; one explicitly
corrected follow-up wrapper checks retention rather than duplication of an approval.
Those files use Eve's native evaluator, not the fixture harness; the fixture
suite inventories but does not execute them. From `apps/leaf-lab`, use
`LEAF_LAB_MODE=opus bun native/suite.ts` or `LEAF_LAB_MODE=jev bun native/suite.ts`
after authorizing spend. Native runs preserve their own frozen source and artifacts.

Native uses Eve's genuine SDK pending-call/approval events and batch approval
policy. Its reads are actual model tool calls, unlike structured fixture prefetch.
Do not equate native pending-card assertions with completed fixture billing writes
or merge the two suites' scores. Its modeled seed inputs and incomplete historical
account data are documented separately; several native assertions do not establish
financial accuracy, trial/proration behavior or real UI card removal.

Use repeatable `--target agent/path/case.eval.ts` options on the fixture suite to
run selected failures. The manifest records that subset; it is not a new full-suite
accuracy measurement. Omitting `--target` still runs every fixture file.

## Timing, accuracy and cost

The headline metric is initial prompt to the **first non-retained approval-ready
event**, measured by the driver. Its clock starts before PDF extraction and context
preparation, and includes generation, validation, preview and repair work. Cold
host startup precedes this clock; it is present only in whole-invocation duration.
This measures backend readiness, not a rendered Slack button or human reaction time.

For clarification-dependent cases, `fromFirstPromptMs` includes scripted follow-up
wall time but no real human waiting. Those cases are labeled “user input required.”
Older traces without a global clock cannot establish an initial-prompt total after
clarification; the last reply's duration is never substituted. Retained confirmations
do not move the first-ready marker. Post-approval execution and subsequent gates
remain separate turns. `cumulativeBackendApprovalReadyMs` is an explicitly separate
sum across user turns, not first-button latency. Read-only/no-gate cases remain null.

Reports retain per-case scores/errors and distinguish active expectation panels
from vacuous perfect panels. Host-startup infrastructure failures and evaluator
timeouts are not model-accuracy evidence. Even when a failed-scoring case produced
a fast gate, it is not a valid latency success. All repairs, failures, infrastructure
attempts and replay costs remain visible.

Provider `usage.cost` is recorded as reported, without inferred token pricing.
Captured generative-provider cost excludes Jev, scorer judges and missing requests;
it is not a full-system invoice. Eve step counts and Braintrust's uninstrumented
model counters are not substitutes for actual provider usage. JSON/Markdown reports
and before/after CSV comparison can be generated from saved artifacts without
calling providers; compare only matching corpus hashes and timing bases.

Compare the corrected Opus and Jev arms from the same completed suite:

```sh
SUITE_DIR=/absolute/path/to/corrected-both-arms/TIMESTAMP-UUID
bun apps/leaf-lab/scripts/compare.ts "$SUITE_DIR" "$SUITE_DIR" \
  "$SUITE_DIR/comparison-opus-vs-jev" --before-arm opus --after-arm jev
```

The comparison retains every selected-arm attempt, including infrastructure
failures and replays, and requires matching corpus fingerprints for speedups.
Known mismatches are rejected. Legacy runs without corpus fingerprints can still
produce descriptive tables labeled provenance unknown, but no speedups or claim
of an identical corrected corpus. Omit arm filters only when each source suite
already contains a single arm.

Mocks do not prove real Stripe proration or production billing correctness. There
is no automatic Opus fallback, full Leaf-operation coverage, OCR, production Slack
integration or validated production safety calibration. Passing a fixture assertion
proves only the properties that assertion actually checks.

## Checks

```sh
cd apps/leaf-lab
bun test tests/suite.test.ts
bun run test
bun run ts
```
