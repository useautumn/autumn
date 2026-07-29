process.env.LEAF_PERF ??= "1";

/**
 * Standalone CMA latency benchmark (no Braintrust). Drives the real live
 * Claude Managed Agents path (driveSessionTurn → skill reads → inference →
 * tool calls) against the deterministic eval mock, prod-faithfully (small
 * surface system prompt + skills attached, read on demand). Prints setup +
 * conversation timing alongside the `[perf] session_turn` milestones.
 *
 * Uses a single-turn billing attach (the mock supports billing) so the run
 * completes cleanly and the time-to-first-response milestones are meaningful.
 *
 * Run: infisical run --env=dev --silent -- bun tests/evals/benchLatency.ts
 * Env: ANTHROPIC_API_KEY + NGROK_AUTHTOKEN (dev). BENCH_RUNS=N for repeats.
 */
import { createSetup } from "./fixtures/createSetup.js";
import { orgSetups } from "./fixtures/orgSetups.js";
import { createEvalContext } from "./harness/createEvalContext.js";
import { createClaudeManagedLiveDriver } from "./harness/drivers/claudeManagedLiveAgent.js";
import { createLeafAgentDriver } from "./harness/drivers/leafAgent.js";
import { user } from "./harness/index.js";

// ENGINE=mastra (default) | claude-managed. BENCH_MODEL forces both engines onto
// the same model so the comparison isolates engine overhead (mastra defaults to
// openai/gpt-5.5, CMA to anthropic/claude-opus-4-6 — not comparable otherwise).
const engine = process.env.ENGINE ?? "mastra";
const model = process.env.BENCH_MODEL ?? "anthropic/claude-opus-4-6";
const makeDriver = () =>
	engine === "claude-managed"
		? createClaudeManagedLiveDriver({ model })
		: createLeafAgentDriver({ model });

// BENCH_TASK=catalog (Railway pricing on an empty org — skill-read heavy) | billing
const task = process.env.BENCH_TASK ?? "catalog";
const setup =
	task === "billing"
		? orgSetups.knowledgePlatform()
		: createSetup({
				tag: "railway",
				features: () => ({}),
				plans: () => ({}),
				customers: () => ({}),
			});
const message =
	task === "billing"
		? "Attach the Scale plan to a new customer. Customer id cus_bench, email bench@cobalt.example. Preview the charge for me."
		: `Please build me Railway's pricing:

This is a credit-based system where 1 credit = $0.01, and different resources cost different amounts of credits:

Memory: 0.039 credits per GB-hour, CPU: 0.078 credits per vCPU-hour, Egress: 5 credits per GB, Storage: 1.5 credits per GB-month

Plans:
- Free plan with 500 credits as a one-time grant (worth $5)
- Hobby at $5/month: Includes 500 credits per month, pay-per-use after that
- Pro at $20/month: Includes 2000 credits per month, pay-per-use after that`;

const round = (ms: number) => Math.round(ms);

const main = async () => {
	const runs = Number(process.env.BENCH_RUNS ?? 1);
	process.stdout.write(`[bench] engine=${engine} model=${model}\n`);
	for (let i = 1; i <= runs; i++) {
		const setupStart = performance.now();
		const context = await createEvalContext({
			driver: makeDriver(),
			name: `bench-${engine}`,
			setup,
		});
		const setupMs = round(performance.now() - setupStart);
		const convoStart = performance.now();
		// BENCH_WARMUP=1 prepends a PRIMING turn: load the billing skill + pull the
		// catalog into context (cache it) and "get ready", so the real message's
		// turn (2nd session_turn log) reuses the warmed cache. Compare turn 2's
		// first_inference / tool_calls / total to the cold baseline.
		const primer =
			"Load your billing knowledge and pull up the current plans and features — a billing request is coming next. Just reply 'ready'.";
		const turns = process.env.BENCH_WARMUP
			? [user({ message: primer }), user({ message })]
			: [user({ message })];
		try {
			const result = await context.runConversation(turns);
			process.stdout.write(
				`[bench] run=${i} setup_ms=${setupMs} conversation_ms=${round(
					performance.now() - convoStart,
				)} tool_calls=${result.toolCalls?.length ?? 0} final_text_len=${
					result.finalText?.length ?? 0
				}\n`,
			);
		} finally {
			await context.cleanup();
		}
	}
	process.exit(0);
};

main().catch((error) => {
	process.stderr.write(`[bench] failed: ${error?.stack ?? error}\n`);
	process.exit(1);
});
