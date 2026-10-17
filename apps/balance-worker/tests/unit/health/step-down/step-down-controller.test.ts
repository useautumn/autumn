import { describe, expect, test } from "bun:test";
import type { OwnNetworkVerdict } from "../../../../src/health/ownNetwork/types/ownNetworkVerdict.js";
import { createStepDownController } from "../../../../src/health/stepDown/createStepDownController.js";
import type { FleetProgress } from "../../../../src/health/stepDown/types/fleetProgress.js";
import type { StepDownPermitResult } from "../../../../src/health/stepDown/types/stepDownPermits.js";

const DEGRADED: OwnNetworkVerdict = {
	state: "degraded",
	at: 10_000,
	windowStartedAt: 7_000,
	segments: 300,
	retransmitRatio: 0.3,
	busyPartitions: 8,
	stalledPartitions: 6,
	heldPartitions: 4,
	stalledHoldings: [
		{ partition: 0, holding: 1 },
		{ partition: 1, holding: 1 },
	],
	losesPackets: true,
};

const RECOVERED: OwnNetworkVerdict = {
	...DEGRADED,
	state: "healthy",
	retransmitRatio: 0.001,
	stalledPartitions: 0,
	losesPackets: false,
};

function fleetAt({
	call,
	keepsUp = () => true,
}: {
	call: number;
	keepsUp?: (partition: number, call: number) => boolean;
}): FleetProgress {
	const highWatermarks = new Map<number, bigint>();
	const nextOffsets = new Map<number, bigint>();
	for (let partition = 0; partition < 16; partition++) {
		const high = BigInt(1_000 + call * 10);
		highWatermarks.set(partition, high);
		nextOffsets.set(partition, keepsUp(partition, call) ? high - 1n : 999n);
	}
	return { highWatermarks, nextOffsets };
}

function harness({
	keepsUp,
	permit = {
		ok: true,
		permit: { slot: 0, key: "slot-0", acquisitionId: "acquisition-1" },
	},
	owns = true,
	currentVerdict = () => DEGRADED,
	readGate,
	releaseFailures = 0,
	baselineFails = false,
	holdingOf = (partition) => (partition <= 3 ? 1 : undefined),
}: {
	holdingOf?: (partition: number) => number | undefined;
	keepsUp?: (partition: number, call: number) => boolean;
	permit?: StepDownPermitResult;
	owns?: boolean;
	currentVerdict?: () => OwnNetworkVerdict;
	readGate?: Promise<void>;
	releaseFailures?: number;
	baselineFails?: boolean;
} = {}) {
	const time = { now: 10_000 };
	const calls: string[] = [];
	const logs: { level: string; message: string }[] = [];
	const listeners = new Set<(verdict: OwnNetworkVerdict) => void>();
	const state = { steppedDown: false, releaseFailures, reads: 0 };
	function log(level: string) {
		return (...args: unknown[]) => {
			logs.push({ level, message: String(args[0]) });
		};
	}
	const controller = createStepDownController({
		ctx: {
			monitor: {
				onDegraded: (listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				verdict: currentVerdict,
			},
			readFleetProgress: async () => {
				calls.push("read-progress");
				const call = state.reads++;
				await readGate;
				if (call === 0 && baselineFails)
					throw new Error("Postgres did not answer");
				return fleetAt({ call, keepsUp });
			},
			ownPartitions: () => new Set([0, 1, 2, 3]),
			permits: {
				acquire: async () => {
					calls.push("acquire");
					return permit;
				},
				release: async () => {
					calls.push("release");
					if (state.releaseFailures === 0) return;
					state.releaseFailures -= 1;
					throw new Error("S3 did not answer");
				},
			},
			partitions: {
				stepDown: async () => {
					calls.push("step-down");
					state.steppedDown = true;
				},
				isSteppedDown: () => state.steppedDown,
				hasAssignment: () => owns,
				holdingOf: ({ partition }) => holdingOf(partition),
			},
			logger: { info: log("info"), warn: log("warn"), error: log("error") },
			now: () => time.now,
			sleep: async (ms) => {
				time.now += ms;
			},
		},
		config: {
			peerWaitMs: 6_000,
			peerPollMs: 1_000,
			minKeptUp: 2,
			recheckAttempts: 3,
			recheckIntervalMs: 1_000,
			minStalledPartitions: 2,
		},
	});
	async function fire(): Promise<void> {
		for (const listener of [...listeners]) listener(DEGRADED);
		await Bun.sleep(0);
		await Bun.sleep(0);
	}
	return { controller, calls, logs, fire, time };
}

function readsOf(calls: string[]): number {
	return calls.filter((call) => call === "read-progress").length;
}

describe("step-down controller", () => {
	test("steps down once the rest of the fleet keeps up with its logs and a permit is granted", async () => {
		const { controller, calls, logs, fire } = harness();
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"step-down",
		]);
		expect(logs).toContainEqual({
			level: "error",
			message: "Own network degraded and peers healthy: stepping down",
		});
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"step-down",
		]);
	});

	test("waits for the fleet to show progress past the baseline, polling until it does", async () => {
		const { controller, calls, fire } = harness({
			keepsUp: (_partition, call) => call >= 2,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"read-progress",
			"acquire",
			"step-down",
		]);
	});

	test("stays when the rest of the fleet falls behind too, then checks again on the next verdict", async () => {
		const { controller, calls, logs, fire } = harness({ keepsUp: () => false });
		controller.start();
		await fire();
		expect(readsOf(calls)).toBe(7);
		expect(calls).not.toContain("acquire");
		expect(logs).toContainEqual({
			level: "warn",
			message: "Own network degraded, but the fleet is not keeping up: staying",
		});
		await fire();
		expect(readsOf(calls)).toBe(14);
		expect(calls).not.toContain("step-down");
	});

	test("stays when only the worker's own partitions and too few others keep up", async () => {
		const { controller, calls, fire } = harness({
			keepsUp: (partition) => partition <= 4,
		});
		controller.start();
		await fire();
		expect(readsOf(calls)).toBe(7);
		expect(calls).not.toContain("acquire");
	});

	test("a baseline that cannot be read keeps the worker in", async () => {
		const { controller, calls, logs, fire } = harness({ baselineFails: true });
		controller.start();
		await fire();
		expect(calls).toEqual(["read-progress"]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Fleet progress could not be read",
		});
	});

	test("stays when no permit is granted", async () => {
		const { controller, calls, logs, fire } = harness({
			permit: { ok: false, reason: "all_taken" },
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-progress", "read-progress", "acquire"]);
		expect(logs).toContainEqual({
			level: "error",
			message:
				"Own network degraded and peers healthy, but no step-down permit: staying",
		});
	});

	test("a network that recovered before the permit landed keeps the worker in and gives the permit back", async () => {
		const { controller, calls, logs, fire } = harness({
			currentVerdict: () => RECOVERED,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"release",
		]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Own network recovered before the step-down: staying",
		});
	});

	test("a trip whose stalled partitions were let go before the permit landed keeps the worker in, though the loss goes on", async () => {
		const moved = { on: false };
		const { controller, calls, logs, fire } = harness({
			holdingOf: (partition) => (moved.on && partition <= 1 ? 2 : 1),
			currentVerdict: () => {
				moved.on = true;
				return DEGRADED;
			},
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-progress", "read-progress", "acquire", "release"]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Own network recovered before the step-down: staying",
		});
	});

	test("loss that pauses for a sample after the permit lands still steps down within the re-check", async () => {
		const verdicts = [RECOVERED, DEGRADED];
		const { controller, calls, fire } = harness({
			currentVerdict: () => verdicts.shift() ?? DEGRADED,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"step-down",
		]);
	});

	test("a verdict that flickers off degraded while the loss goes on still steps down", async () => {
		for (const flicker of [
			{ ...DEGRADED, state: "healthy" as const, stalledPartitions: 1 },
			{ ...DEGRADED, state: "insufficient_data" as const, segments: 0 },
		]) {
			const { controller, calls, fire } = harness({
				currentVerdict: () => flicker,
			});
			controller.start();
			await fire();
			expect(calls).toEqual([
				"read-progress",
				"read-progress",
				"acquire",
				"step-down",
			]);
		}
	});

	test("a worker that owns nothing never checks", async () => {
		const { controller, calls, fire } = harness({
			owns: false,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([]);
	});

	test("a permit that could not be given back after a recovery is released again at stop", async () => {
		const { controller, calls, fire } = harness({
			currentVerdict: () => RECOVERED,
			releaseFailures: 1,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"release",
		]);
		await controller.stop();
		expect(calls).toEqual([
			"read-progress",
			"read-progress",
			"acquire",
			"release",
			"release",
		]);
	});

	test("stop waits for a check in flight, which then takes no permit and steps nothing down", async () => {
		const gate = Promise.withResolvers<void>();
		const { controller, calls, fire } = harness({
			readGate: gate.promise,
		});
		controller.start();
		await fire();
		const stopping = controller.stop();
		gate.resolve();
		await stopping;
		expect(calls).toEqual(["read-progress"]);
	});

	test("stop lets go of the verdicts and releases a permit it holds", async () => {
		const { controller, calls, fire } = harness();
		controller.start();
		await fire();
		await controller.stop();
		expect(calls.at(-1)).toBe("release");
		await fire();
		expect(calls.filter((call) => call === "acquire")).toHaveLength(1);
	});
});
