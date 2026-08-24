import { cpus } from "node:os";
import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { customerEntitlementsToApiBalance } from "../src/api/balances/customerEntitlementsToApiBalance.js";
import type { Command } from "../src/api/types/command.js";
import { TrackResultSchema } from "../src/api/track/types/trackResult.js";
import { trackResultToTrackResponse } from "../src/api/track/trackResultToTrackResponse.js";
import { computeTrackPlan } from "../src/internal/balances/actions/track/compute/computeTrackPlan.js";
import { trackContextToTrackResult } from "../src/internal/balances/actions/track/result/trackContextToTrackResult.js";
import { setupTrackContext } from "../src/internal/balances/actions/track/setup/setupTrackContext.js";
import { customerEntitlementsToDeductionRows } from "../src/internal/balances/deduction/customerEntitlementsToDeductionRows.js";
import { applyBalancePlan } from "../src/internal/balances/execute/applyBalancePlan.js";
import { selectCustomerEntitlements } from "../src/internal/balances/setup/selectCustomerEntitlements.js";
import { setupBalanceContext } from "../src/internal/balances/setup/setupBalanceContext.js";
import { sortCustomerEntitlements } from "../src/internal/balances/setup/sortCustomerEntitlements.js";
import { createShard } from "../src/internal/shard/createShard.js";
import type { ShardContext } from "../src/internal/shard/types/shardContext.js";
import { loadSubject } from "../src/internal/subjects/actions/loadSubject.js";
import { featureStore } from "../src/sqlite/features/store/featureStore.js";
import { createTestShardContext } from "../tests/unit/testUtils/createTestShardContext.js";
import { seedSubject } from "../tests/unit/testUtils/seedSubject.js";

const ORG_ID = "org_bench";
const ENV = AppEnv.Sandbox;
const CUSTOMER_ID = "cus_bench";
const FEATURE_ID = "messages";
const AT = 1_700_000_000_000;
const SEEDED_BALANCE = 1_000_000_000;
const ENTITLEMENT_COUNTS = [1, 10, 100];
const WARMUP = 2_000;
const MICROS_PER_MS = 1_000;
// Serial rows are the writer loop's replay table; a benchmark run would keep
// every result body alive, so prune outside the timed region.
const SERIAL_PRUNE_EVERY = 5_000;

const DEFAULT_ITERATIONS = 100_000;

// `bun run bench --iterations=2000` for a quick pass.
const toIterations = (): number => {
	const flag = process.argv.find((argument) =>
		argument.startsWith("--iterations="),
	);
	return flag ? Number(flag.split("=")[1]) : DEFAULT_ITERATIONS;
};

const iterations = toIterations();

type Sample = { mean: number; p50: number; p99: number };

const percentile = ({
	sorted,
	fraction,
}: {
	sorted: Float64Array;
	fraction: number;
}): number =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

const toSample = ({ durations }: { durations: Float64Array }): Sample => {
	let total = 0;
	for (const duration of durations) total += duration;
	const sorted = durations.slice().sort();

	return {
		mean: (total / durations.length) * MICROS_PER_MS,
		p50: percentile({ sorted, fraction: 0.5 }) * MICROS_PER_MS,
		p99: percentile({ sorted, fraction: 0.99 }) * MICROS_PER_MS,
	};
};

const seedHarness = ({ entitlementCount }: { entitlementCount: number }) => {
	const ctx = createTestShardContext();
	seedSubject({
		ctx,
		orgId: ORG_ID,
		env: ENV,
		customerId: CUSTOMER_ID,
		entitlements: Array.from({ length: entitlementCount }, () => ({
			featureId: FEATURE_ID,
			balance: SEEDED_BALANCE,
			allowance: SEEDED_BALANCE,
		})),
	});

	return ctx;
};

const toCommand = ({ id }: { id: string }): Command => ({
	id,
	org_id: ORG_ID,
	env: ENV,
	customer_id: CUSTOMER_ID,
	at: AT,
	api_version: "1.2",
	kind: "track",
	body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID, value: 1 },
});

const pruneSerials = ({ ctx }: { ctx: ShardContext }): void => {
	ctx.sqlite.run(sql`delete from serials`);
};

const measureEndToEnd = async ({
	entitlementCount,
}: {
	entitlementCount: number;
}): Promise<Sample> => {
	const ctx = seedHarness({ entitlementCount });
	const shard = createShard({ ctx });
	const durations = new Float64Array(iterations);

	for (let index = 0; index < WARMUP; index++) {
		await shard.run(toCommand({ id: `warm_${index}` }));
	}
	pruneSerials({ ctx });

	for (let index = 0; index < iterations; index++) {
		const command = toCommand({ id: `cmd_${index}` });
		const startedAt = performance.now();
		await shard.run(command);
		durations[index] = performance.now() - startedAt;
		if (index % SERIAL_PRUNE_EVERY === 0) pruneSerials({ ctx });
	}

	await shard.stop();
	return toSample({ durations });
};

const measureReplay = async ({
	entitlementCount,
}: {
	entitlementCount: number;
}): Promise<Sample> => {
	const ctx = seedHarness({ entitlementCount });
	const shard = createShard({ ctx });
	const command = toCommand({ id: "cmd_replay" });
	await shard.run(command);

	const durations = new Float64Array(iterations);
	for (let index = 0; index < WARMUP; index++) await shard.run(command);
	for (let index = 0; index < iterations; index++) {
		const startedAt = performance.now();
		await shard.run(command);
		durations[index] = performance.now() - startedAt;
	}

	await shard.stop();
	return toSample({ durations });
};

const measurePhases = ({ entitlementCount }: { entitlementCount: number }) => {
	const ctx = seedHarness({ entitlementCount });
	const setup = new Float64Array(iterations);
	const compute = new Float64Array(iterations);
	const execute = new Float64Array(iterations);
	const collect = new Float64Array(iterations);
	const serialize = new Float64Array(iterations);
	const clientParse = new Float64Array(iterations);
	const clientRespond = new Float64Array(iterations);
	let wireBytes = 0;

	for (let index = 0; index < iterations + WARMUP; index++) {
		const command = toCommand({ id: `phase_${index}` });
		const sampled = index >= WARMUP;
		const at = sampled ? index - WARMUP : 0;

		const setupAt = performance.now();
		const trackContext = setupTrackContext({
			balanceContext: setupBalanceContext({ ctx, command }),
		});
		const computeAt = performance.now();
		const plan = computeTrackPlan({ trackContext });
		const executeAt = performance.now();
		applyBalancePlan({ ctx, balanceContext: trackContext, plan });
		const collectAt = performance.now();
		const result = trackContextToTrackResult({ trackContext, plan });
		const serializeAt = performance.now();
		const wire = JSON.stringify(result);
		const parseAt = performance.now();
		const parsed = TrackResultSchema.parse(JSON.parse(wire));
		const respondAt = performance.now();
		trackResultToTrackResponse({ result: parsed });
		const doneAt = performance.now();

		if (!sampled) continue;
		wireBytes = wire.length;
		setup[at] = computeAt - setupAt;
		compute[at] = executeAt - computeAt;
		execute[at] = collectAt - executeAt;
		collect[at] = serializeAt - collectAt;
		serialize[at] = parseAt - serializeAt;
		clientParse[at] = respondAt - parseAt;
		clientRespond[at] = doneAt - respondAt;
	}

	return {
		setup: toSample({ durations: setup }),
		compute: toSample({ durations: compute }),
		execute: toSample({ durations: execute }),
		collect: toSample({ durations: collect }),
		serialize: toSample({ durations: serialize }),
		clientParse: toSample({ durations: clientParse }),
		clientRespond: toSample({ durations: clientRespond }),
		wireBytes,
	};
};

// Unit D: the FullCusEnt-shaped work the ledger does only to reach shared helpers.
const measureSharedHelpers = ({
	entitlementCount,
}: {
	entitlementCount: number;
}) => {
	const ctx = seedHarness({ entitlementCount });
	const feature = featureStore.getByFeatureId({
		ctx,
		orgId: ORG_ID,
		env: ENV,
		featureId: FEATURE_ID,
	});
	if (!feature) throw new Error("benchmark feature missing");

	const load = new Float64Array(iterations);
	const select = new Float64Array(iterations);
	const sort = new Float64Array(iterations);
	const deductionRows = new Float64Array(iterations);
	const apiBalance = new Float64Array(iterations);

	for (let index = 0; index < iterations + WARMUP; index++) {
		const sampled = index >= WARMUP;
		const at = sampled ? index - WARMUP : 0;

		const loadAt = performance.now();
		const subject = loadSubject({
			ctx,
			internalCustomerId: `icus_${CUSTOMER_ID}`,
			features: [feature],
		});
		const selectAt = performance.now();
		const customerEntitlements = selectCustomerEntitlements({
			customerEntitlements: subject.customerEntitlements,
			at: AT,
		});
		const sortAt = performance.now();
		sortCustomerEntitlements({ customerEntitlements });
		const deductionRowsAt = performance.now();
		customerEntitlementsToDeductionRows({
			customerEntitlements,
			request: { feature, amount: 1 },
		});
		const apiBalanceAt = performance.now();
		customerEntitlementsToApiBalance({ customerEntitlements, feature });
		const doneAt = performance.now();

		if (!sampled) continue;
		load[at] = selectAt - loadAt;
		select[at] = sortAt - selectAt;
		sort[at] = deductionRowsAt - sortAt;
		deductionRows[at] = apiBalanceAt - deductionRowsAt;
		apiBalance[at] = doneAt - apiBalanceAt;
	}

	return {
		load: toSample({ durations: load }),
		select: toSample({ durations: select }),
		sort: toSample({ durations: sort }),
		deductionRows: toSample({ durations: deductionRows }),
		apiBalance: toSample({ durations: apiBalance }),
	};
};

const pad = ({ text, width }: { text: string; width: number }): string =>
	text.padStart(width);

const toRow = ({ label, sample }: { label: string; sample: Sample }): string =>
	[
		label.padEnd(26),
		pad({ text: sample.mean.toFixed(2), width: 10 }),
		pad({ text: sample.p50.toFixed(2), width: 10 }),
		pad({ text: sample.p99.toFixed(2), width: 10 }),
	].join(" ");

const HEADER = [
	"".padEnd(26),
	pad({ text: "mean µs", width: 10 }),
	pad({ text: "p50 µs", width: 10 }),
	pad({ text: "p99 µs", width: 10 }),
].join(" ");

const printHeader = (): void => {
	const [cpu] = cpus();
	process.stdout.write(
		[
			"track benchmark — bun:sqlite in-memory, memory journal",
			`bun ${Bun.version} · ${process.platform}/${process.arch} · ${cpu?.model ?? "unknown cpu"}`,
			`${iterations.toLocaleString("en-US")} tracks of value 1 per row, ${WARMUP.toLocaleString("en-US")} warmup`,
			"",
		].join("\n"),
	);
};

const runCount = async ({
	entitlementCount,
}: {
	entitlementCount: number;
}): Promise<void> => {
	const endToEnd = await measureEndToEnd({ entitlementCount });
	const replay = await measureReplay({ entitlementCount });
	const phases = measurePhases({ entitlementCount });
	const shared = measureSharedHelpers({ entitlementCount });

	process.stdout.write(
		[
			`── ${entitlementCount} customer-level entitlement(s) on one feature · ${phases.wireBytes.toLocaleString("en-US")} wire bytes`,
			HEADER,
			toRow({ label: "Shard.run (end to end)", sample: endToEnd }),
			toRow({ label: "Shard.run (serial replay)", sample: replay }),
			toRow({ label: "  setupTrackContext", sample: phases.setup }),
			toRow({ label: "  computeTrackPlan", sample: phases.compute }),
			toRow({ label: "  applyBalancePlan", sample: phases.execute }),
			toRow({ label: "  trackContextToTrackResult", sample: phases.collect }),
			toRow({ label: "JSON.stringify(result)", sample: phases.serialize }),
			toRow({ label: "client.parse(TrackResult)", sample: phases.clientParse }),
			toRow({
				label: "client.trackResultToTrackResponse",
				sample: phases.clientRespond,
			}),
			toRow({ label: "  ↳ loadSubject (read)", sample: shared.load }),
			toRow({
				label: "  ↳ selectCustomerEntitlements",
				sample: shared.select,
			}),
			toRow({ label: "  ↳ sortCusEntsForDeduction", sample: shared.sort }),
			toRow({
				label: "  ↳ customerEntitlementsToDeductionRows",
				sample: shared.deductionRows,
			}),
			toRow({
				label: "  ↳ customerEntitlementsToApiBalance",
				sample: shared.apiBalance,
			}),
			"",
			"",
		].join("\n"),
	);
};

const main = async (): Promise<void> => {
	printHeader();
	for (const entitlementCount of ENTITLEMENT_COUNTS) {
		await runCount({ entitlementCount });
	}
};

await main();
