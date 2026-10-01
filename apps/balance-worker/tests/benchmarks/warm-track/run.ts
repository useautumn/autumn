import { heapStats } from "bun:jsc";
import { performance } from "node:perf_hooks";
import {
	createSubjectState,
	type MeteringIdentity,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { syncSections } from "../../../src/logging/eventLoopStalls/syncSections.js";
import {
	createCustomerEntitlement,
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { buildScenario } from "../track-throughput/scenarios.js";

/** One warm customer, tracks decided one after another: the CPU and the heap each decide costs once nothing is cold. */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
/** The collector's own count of bytes allocated per cycle (`ca=` on every GC start line) is the one exact allocation measure Bun exposes; the child is run with it logged and the parent sums the cycles inside the timed run. */
if (!args.child) {
	const child = Bun.spawnSync({
		cmd: [process.execPath, ...process.argv.slice(1), "--child"],
		env: { ...process.env, BUN_JSC_logGC: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const gcLog = child.stderr.toString();
	const timed = gcLog.slice(
		gcLog.lastIndexOf("BENCH_MARK timed_start"),
		gcLog.lastIndexOf("BENCH_MARK timed_end"),
	);
	let allocatedKb = 0;
	let cycles = 0;
	for (const match of timed.matchAll(
		/START \S+ \S+ => (\w+), ca=([0-9.]+)kb/g,
	)) {
		allocatedKb += Number(match[2]);
		if (match[1] === "EdenCollection" || match[1] === "FullCollection")
			cycles += 1;
	}
	const pauses = [...timed.matchAll(/p=([0-9.]+)ms \(max/g)].map((match) =>
		Number(match[1]),
	);
	const report = JSON.parse(child.stdout.toString()) as { count: number };
	console.log(
		JSON.stringify(
			{
				...report,
				allocation: {
					allocatedKBPerTrack: Number((allocatedKb / report.count).toFixed(2)),
					gcCycles: cycles,
					gcPauseMs: {
						max: Number(Math.max(0, ...pauses).toFixed(2)),
						total: Number(
							pauses.reduce((sum, pause) => sum + pause, 0).toFixed(1),
						),
					},
				},
			},
			null,
			2,
		),
	);
	process.exit(child.exitCode ?? 1);
}

const products = Number(args.products ?? 4);
const features = Number(args.features ?? 15);
const entities = Number(args.entities ?? 0);
const total = Number(args.total ?? 10_000);
const warmup = Number(args.warmup ?? 1_000);

const scenario = buildScenario({ name: "warm", products, features });
const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs: 0, applyMs: 0 },
	serialize: true,
});

const customerIdentity: MeteringIdentity = {
	...testIdentity,
	customerId: "cus_warm",
};
const customerState = scenario.stateFor({ identity: customerIdentity });
await bench.processor.initialize({
	request: createInitializeRequest({
		state: customerState,
		commandId: "init_customer",
		requestId: "req_init_customer",
	}),
});

const entityStateOf = ({ index }: { index: number }): SubjectState => {
	const internalId = `ent_internal_${index}`;
	const identity = { ...customerIdentity, entityId: `ent_${index}` };
	return createSubjectState({
		identity,
		customer: customerState.customer,
		customerEntitlements: scenario.features.map((featureId) => ({
			...createCustomerEntitlement({
				id: `entity_${index}_${featureId}`,
				featureId,
				balance: 1_000_000_000,
			}),
			customer_product_id: null,
			internal_entity_id: internalId,
			next_reset_at: 4_000_000_000_000,
		})),
		entity: {
			id: identity.entityId,
			internal_id: internalId,
			internal_customer_id: customerState.customer.internal_id,
			feature_id: "projects",
			org_id: identity.orgId,
			created_at: testOccurredAt,
			env: identity.env,
			name: null,
			deleted: false,
			internal_feature_id: "feat_projects",
		},
	});
};
const identities: MeteringIdentity[] = [];
for (let index = 0; index < entities; index++) {
	const state = entityStateOf({ index });
	await bench.processor.initialize({
		request: createInitializeRequest({
			state,
			commandId: `init_entity_${index}`,
			requestId: `req_init_entity_${index}`,
		}),
	});
	identities.push(state.identity);
}
if (identities.length === 0) identities.push(customerIdentity);

let sequence = 0;
const nextCommand = (): TrackCommand => {
	const n = sequence++;
	const identity = identities[n % identities.length];
	if (!identity) throw new Error("identity");
	return createTrackCommand({
		identity,
		commandId: `trk_${n}`,
		featureId: scenario.features[n % scenario.features.length],
		value: 1,
		occurredAt: testOccurredAt + n,
	});
};

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

/** Tracks decided one after another: CPU per decide, the sync sections inside it, and what a full collection cannot reclaim afterwards. */
const run = async ({ count }: { count: number }) => {
	const commands = Array.from({ length: count }, nextCommand);
	const latencies: number[] = [];
	Bun.gc(true);
	syncSections.drainTotals();
	const heapBefore = heapStats();
	console.error("BENCH_MARK timed_start");
	const cpuBefore = process.cpuUsage();
	const started = performance.now();
	for (const command of commands) {
		const at = performance.now();
		await bench.processor.track({ command });
		latencies.push(performance.now() - at);
	}
	const elapsedMs = performance.now() - started;
	const cpu = process.cpuUsage(cpuBefore);
	const slowSections = syncSections
		.endedSince({ since: started })
		.slice(0, 8)
		.map((section) => `${section.label} ${section.durationMs.toFixed(1)}ms`);
	const totals = syncSections.drainTotals();
	Bun.gc(true);
	console.error("BENCH_MARK timed_end");
	const heapAfter = heapStats();
	latencies.sort((a, b) => a - b);
	const sections = Object.fromEntries(
		Object.entries(totals).map(([label, total]) => [
			label,
			{
				calls: total.count,
				msPerCall: Number((total.totalMs / total.count).toFixed(4)),
				maxMs: Number(total.maxMs.toFixed(3)),
			},
		]),
	);
	return {
		count,
		elapsedMs: Math.round(elapsedMs),
		tracksPerSec: Math.round((count / elapsedMs) * 1000),
		cpuUsPerTrack: Math.round((cpu.user + cpu.system) / count),
		wallMs: {
			p50: percentile(latencies, 0.5).toFixed(3),
			p99: percentile(latencies, 0.99).toFixed(3),
			max: percentile(latencies, 1).toFixed(3),
		},
		retainedAfterGcKBPerTrack: Number(
			((heapAfter.heapSize - heapBefore.heapSize) / 1024 / count).toFixed(2),
		),
		slowSections,
		sections,
	};
};

await run({ count: warmup });
const result = await run({ count: total });
console.log(
	JSON.stringify(
		{
			products,
			features,
			entities,
			stateBytes: JSON.stringify(customerState).length,
			entityStateBytes:
				entities > 0 ? JSON.stringify(entityStateOf({ index: 0 })).length : 0,
			...result,
		},
		null,
		2,
	),
);
await bench.processor.drain();
process.exit(0);
