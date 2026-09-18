# Native Eve lab adapter

This app runs 13 native Eve cases against an isolated modeled org. Twelve wrappers re-export the original `apps/leaf/evals` definitions unchanged; the native-only `follow-up-carry-over` wrapper uses the explicitly approved corrected definition described below. It does not call real Autumn billing endpoints.

## Run

From `apps/leaf-lab`, after authorizing provider spend:

```sh
LEAF_LAB_MODE=jev bun native/launch.ts --eval
LEAF_LAB_MODE=flash bun native/launch.ts --eval agent/attach-card
LEAF_LAB_MODE=opus bun native/launch.ts --eval
```

For benchmark runs, use `LEAF_LAB_MODE=opus bun native/suite.ts` (or append native case IDs). This freezes and hashes the lab source, separately copies/hashes both the original assertions and local wrappers, records the exact command and `corrected-definition` label before launch, and runs the frozen launcher sequentially. Original run results remain separate and are not relabeled as corrected-definition results. Native uses its own exact CLI path so teardown cannot match fixture-suite hosts; it waits for the owned host process tree and runner to exit before returning.

`jev` uses Jev for skill/tool selection and pre-approval verification with Flash Nitro for the actual conversation. `flash` and `opus` use the same tool adapter, fixtures, instructions and safety checks without Jev calls. Override `LEAF_NATIVE_MODEL` for an explicit OpenRouter model. `OPENROUTER_API_KEY` is required for model turns; Jev also requires `TYPESAFE_API_KEY`. Keys are inherited, never written to reports.

Without `--eval`, the launcher starts the mock bridge and Eve host only. It prints the selected local port and writes `target.json`; no model turn is started. `--check` shuts it down after a successful health check, without a model request. `LEAF_NATIVE_TODAY` optionally fixes the model-visible current date. `LEAF_LAB_REPORT_DIR` defaults to `~/.capy/work/leaf-lab-full/native`; each invocation creates a timestamped child with provider requests/responses/timings, bridge observations, host logs, seed provenance and CLI outputs. Genuine assertion/event artifacts are copied to its `eve-evals` directory; Eve also retains them under this app's own `.eve/evals`, never the baseline application's `.eve`.

## Approval and observation contract

Dynamic `autumn__*` tools use Eve's real request approval policy. Validation returns `user-approval`; the SDK owns pending calls and `input.requested`. Only after SDK approval enters the tool executor does it authorize the immutable call in the loopback bridge. Missing previews, unknown targets, drifted approval inputs and superseded requests are rejected. Repeated execution of the same approved call ID returns the original mock result. Custom response policies are deliberately absent: Eve 0.47.2's approval coordinator discards unrelated text follow-ups whenever a pending request has a response policy.

All Autumn reads are model tool calls. Context selection fetches no customer/catalog data; its evidence is conversation history and observed results only. Tool selection and discovery fetch metadata, not hidden business state. This preserves the meaning of no-tool/no-customer-search assertions. Negative getCustomer results remain observable tool results instead of being converted into failed transport calls.

Eve's `turn.started` instruction snapshot precedes the incoming user message. Jev selection therefore runs at `step.started`, where the complete current message is available. Selected skill guidance is supplied with the first selected tool's description; no extra tool or fabricated tool result is inserted. Approval callbacks are authored inline in the dynamic tool definition so Eve can attach durable callback descriptors.

The native approval policy supports one SDK batch containing multiple pending calls and asks the model to give every call the same complete summary. It does not synthesize batch events or rewrite descriptions. This is distinct from the fixture harness's sequential per-write approvals. The native cases stop at proposal state, so a pass is not proof of completed billing execution or a statement that these policies are interchangeable.

`supersede_approval` uses the public `ClientSession.respond([{requestId, optionId: "cancel"}])` API. Request IDs come only from genuine `input.requested` hook observations; `input.resolved` retires their backend proposal. Questions do not call this tool, and identical writes are refused while their original approval remains active. The dedicated `runtime-fixture` uses Eve's documented deterministic mock model to verify real question retention, SDK cancellation and replacement events without provider calls; it is a protocol test, not a model-accuracy eval.

The original follow-up assertion requires a second pending attach, conflicting with preservation of the existing approval. Its source and earlier results remain unchanged. The corrected native-only wrapper requires one unchanged, unresolved request ID/call ID/input across both turns, the intended customer and modeled `growth` plan, a 14-day trial, and no completed attach execution. It clones the original request before the second turn so mutation cannot hide changed terms. Corrected-definition scores must be reported separately from original-definition scores.

The latest native-only preservation guard retains canceled proposal terms and blocks silent invoice/access changes during refinement. It also enforces the real no-card-trial/invoice incompatibility, including the revert exception. Compatibility choices currently recognize only four explicit confirmations listed in `lib/preservation.ts`; other wording requires clarification. These latest guards have keyless tests but no paid-model rerun. The completed native Opus/Jev comparison predates them, and is not validation of the current guard behavior. The original refinement scorer can demand a replacement where the safe result is a compatibility question.

## Seed provenance and limitations

`lib/seed.ts` combines the knowledge-platform fixture catalog with source-backed $20/month Pro plans from the server's `generate-billing-request.test.ts` provisioning tests. Those tests establish `gen-attach-multi`, `gen-attach-trial`, and their suffixed Pro identifiers. The corrected fixture base-price factory and item prices use major currency units; native copies amounts directly. Earlier immutable baseline snapshots intentionally retain their old `/100` normalization for the old cent-encoded factory, and must not be replayed against the corrected shared fixture without freezing the matching dependency revision.

The native files do not provide the original Growth catalog, `2094584-eval` / `exec-mt2unrns-b` provisioning, or historical subscription/payment state. This modeled org explicitly uses a Growth alias of the fixture Launch plan and empty sandbox customers for those IDs. These are documented evaluation inputs, not claims about historical accounts. No $1,035 price is copied from an assertion into catalog state; it must come from the user's request.

The corrected mock previews format the requested or catalog billing interval rather than always saying annual, but remain simplified and omit real trial/proration calculations. Reward creation stores a schema-validated sandbox record only. Passing existing assertions does not establish processor financial accuracy, correct reward terms, old-card UI removal, or full schedule economics; several original assertions do not check those properties.

## Keyless validation

```sh
bun test tests/nativeAdapter.test.ts
node node_modules/typescript/bin/tsc --noEmit -p native/tsconfig.json
LEAF_LAB_MODE=flash bun native/launch.ts --check
bun native/runtimeCheck.ts
cd native
node ../node_modules/eve/bin/eve.js eval --list
node ../node_modules/eve/bin/eve.js build
```

The scoped typecheck covers adapter/agent/test implementation. Typechecking the original eval definitions additionally reports their existing nullable `event.data.message` error and the narrowed `writeCalls` type losing `turnIndex`; their code remains unchanged.

## Integration

`startNativeBridge({ mode, reportDir, today? })` returns `{ url, token, close }`. The agent receives `LEAF_NATIVE_BRIDGE_URL/TOKEN` through the launcher; `lib/protocol.ts` is the transport contract. The bridge imports the real MCP registry, shared preview equality guard, existing API mock, shared `askJev`, and parent `modelTraceFetch` rather than duplicating request schemas or billing calculations. Its evidence-only context selector is intentionally separate from prefetching fixture context. Shared context/request helpers can replace that selector/validator if they retain this observation and genuine approval contract.
