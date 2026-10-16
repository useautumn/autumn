import { performance } from "node:perf_hooks";
import {
	parseFinalizeCommand,
	type TrackCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import { syncSections } from "../../../src/logging/eventLoopStalls/syncSections.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * One hot customer on one partition processor, as a lock run drives its owner: `rate` lock tracks a second, each released
 * `finalizeAfterMs` after its reply, on top of `held` locks left open. Reports finalize latency and the main thread's
 * synchronous sections per second.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const rate = Number(args.rate ?? 400);
const seconds = Number(args.seconds ?? 15);
const held = Number(args.held ?? 0);
const finalizeAfterMs = Number(args.finalizeAfterMs ?? 200);
/** Staging's hot partition at 21×: ~3.5 ms per log commit, ~19 ms per store apply (commit_window, #404). */
const appendMs = Number(args.appendMs ?? 3.5);
const applyMs = Number(args.applyMs ?? 19);

const FEATURE_ID = "feature_0";
const identity = testIdentity;
const bench = await createBenchProcessor({
	scenario: scenarios.typical,
	partition: 0,
	latency: { appendMs, applyMs },
	serialize: true,
});
await bench.processor.initialize({
	request: createInitializeRequest({
		state: scenarios.typical.stateFor({ identity }),
		commandId: "init_hot",
		requestId: "req_init_hot",
	}),
});

const lockTrackOf = ({ lockId }: { lockId: string }): TrackCommand => ({
	...createTrackCommand({
		identity,
		commandId: `lock_${lockId}`,
		featureId: FEATURE_ID,
		value: 1,
	}),
	lock: {
		id: `lck_${lockId}`,
		lockId,
		expiresAt: testOccurredAt + 86_400_000,
		expiryAction: "release",
	},
});

const releaseOf = ({ lock }: { lock: WorkerLock }) =>
	parseFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "finalize",
			commandId: `finalize_${lock.lock_id}`,
			requestId: `req_finalize_${lock.lock_id}`,
			identity,
			occurredAt: testOccurredAt,
			org: testOrg,
			lock,
			internalFeatureId: `feat_${FEATURE_ID}`,
			finalValue: 0,
			properties: null,
		},
	});

const takeLock = async ({
	lockId,
}: {
	lockId: string;
}): Promise<WorkerLock> => {
	const reply = await bench.processor.track({
		command: lockTrackOf({ lockId }),
	});
	const opened = reply.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (opened?.table !== "locks" || opened.op !== "insert")
		throw new Error(`Lock ${lockId} was not opened`);
	return opened.row;
};

for (let start = 0; start < held; start += 500)
	await Promise.all(
		Array.from({ length: Math.min(500, held - start) }, (_, i) =>
			takeLock({ lockId: `held_${start + i}` }),
		),
	);

const percentile = (values: number[], p: number) => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const at = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return Math.round((sorted[at] ?? 0) * 100) / 100;
};

const lockMs: number[] = [];
const finalizeMs: number[] = [];
let failed = 0;
const inFlight: Promise<void>[] = [];

const lockThenRelease = async ({ lockId }: { lockId: string }) => {
	const lockedAt = performance.now();
	const lock = await takeLock({ lockId });
	lockMs.push(performance.now() - lockedAt);
	await Bun.sleep(finalizeAfterMs);
	const finalizedAt = performance.now();
	await bench.processor.finalize({ command: releaseOf({ lock }) });
	finalizeMs.push(performance.now() - finalizedAt);
};

syncSections.drainTotals();
const startedAt = performance.now();
const total = Math.round(rate * seconds);
for (let sent = 0; sent < total; sent++) {
	const due = startedAt + (sent * 1000) / rate;
	const wait = due - performance.now();
	if (wait > 1) await Bun.sleep(wait);
	inFlight.push(
		lockThenRelease({ lockId: `hot_${sent}` }).catch(() => {
			failed += 1;
		}),
	);
}
const sentMs = performance.now() - startedAt;
await Promise.all(inFlight);
const elapsedS = (performance.now() - startedAt) / 1000;
const sections = syncSections.drainTotals();

const perSecond = (label: string) => {
	const section = sections[label];
	if (!section) return null;
	return {
		msPerS: Math.round((section.totalMs / elapsedS) * 10) / 10,
		msPerCall: Math.round((section.totalMs / section.count) * 1000) / 1000,
	};
};

console.log(
	JSON.stringify({
		rate,
		held,
		achievedLocksPerS: Math.round((total / sentMs) * 1000),
		failed,
		lockMs: { p50: percentile(lockMs, 50), p99: percentile(lockMs, 99) },
		finalizeMs: {
			p50: percentile(finalizeMs, 50),
			p99: percentile(finalizeMs, 99),
		},
		mainThread: {
			writerDecide: perSecond("writer.decide"),
			subjectWeigh: perSecond("subject.weigh"),
			trackDecide: perSecond("track.decide"),
			finalizeDecide: perSecond("finalize.decide"),
			recordEncode: perSecond("record.encode"),
		},
	}),
);
process.exit(0);
