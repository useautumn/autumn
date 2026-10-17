import { describe, expect, test } from "bun:test";
import type { SlotHeartbeat } from "../../../../src/blueGreen/types/slotHeartbeat.js";
import type { OwnNetworkVerdict } from "../../../../src/health/ownNetwork/types/ownNetworkVerdict.js";
import { createStepDownController } from "../../../../src/health/stepDown/createStepDownController.js";
import type { FleetListing } from "../../../../src/health/stepDown/types/fleetHeartbeats.js";
import type { StepDownPermitResult } from "../../../../src/health/stepDown/types/stepDownPermits.js";
import { partitionsFrom, peerHeartbeat } from "./peerHeartbeats.js";

const DEGRADED: OwnNetworkVerdict = {
	state: "degraded",
	at: 10_000,
	windowStartedAt: 7_000,
	segments: 300,
	retransmitRatio: 0.3,
	busyPartitions: 8,
	stalledPartitions: 6,
};

function healthyPeers(): SlotHeartbeat[] {
	return ["http://a", "http://b", "http://c"].map((endpoint, index) =>
		peerHeartbeat({
			endpoint,
			partitions: partitionsFrom({ first: index * 4, count: 4 }),
		}),
	);
}

function harness({
	writtenSince,
	permit = {
		ok: true,
		permit: { slot: 0, key: "slot-0", acquisitionId: "acquisition-1" },
	},
	owns = true,
	currentVerdict = () => DEGRADED,
	readPeersGate,
	releaseFailures = 0,
	baselineFails = false,
}: {
	writtenSince: (now: number) => SlotHeartbeat[];
	permit?: StepDownPermitResult;
	owns?: boolean;
	currentVerdict?: () => OwnNetworkVerdict;
	readPeersGate?: Promise<void>;
	releaseFailures?: number;
	baselineFails?: boolean;
}) {
	const time = { now: 10_000 };
	const calls: string[] = [];
	const logs: { level: string; message: string }[] = [];
	const listeners = new Set<(verdict: OwnNetworkVerdict) => void>();
	const state = { steppedDown: false, releaseFailures };
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
			readPeers: async ({ since }: { since: FleetListing | null }) => {
				calls.push("read-peers");
				await readPeersGate;
				if (since === null && baselineFails)
					throw new Error("S3 did not answer");
				return {
					listing: new Map(),
					changed: since === null ? [] : writtenSince(time.now),
				};
			},
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
			},
			logger: { info: log("info"), warn: log("warn"), error: log("error") },
			now: () => time.now,
			sleep: async (ms) => {
				time.now += ms;
			},
		},
		config: {
			selfEndpoint: "http://self",
			peerWaitMs: 6_000,
			peerPollMs: 1_000,
			partitionCount: 16,
			ackAgeLimitMs: 3_000,
			minPeers: 2,
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
	return calls.filter((call) => call === "read-peers").length;
}

describe("step-down controller", () => {
	test("steps down once peers that wrote after it began vouch and a permit is granted", async () => {
		const { controller, calls, logs, fire } = harness({
			writtenSince: healthyPeers,
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "read-peers", "acquire", "step-down"]);
		expect(logs).toContainEqual({
			level: "error",
			message: "Own network degraded and peers healthy: stepping down",
		});
		await fire();
		expect(calls).toEqual(["read-peers", "read-peers", "acquire", "step-down"]);
	});

	test("waits for peers to write after it began, polling until they do", async () => {
		const { controller, calls, fire } = harness({
			writtenSince: (now) => (now >= 12_000 ? healthyPeers() : []),
		});
		controller.start();
		await fire();
		expect(calls).toEqual([
			"read-peers",
			"read-peers",
			"read-peers",
			"acquire",
			"step-down",
		]);
	});

	test("stays when peers are degraded too, then checks again on the next verdict", async () => {
		const { controller, calls, logs, fire } = harness({
			writtenSince: () =>
				healthyPeers().map((heartbeat) =>
					peerHeartbeat({
						endpoint: heartbeat.endpoint,
						partitions: heartbeat.partitions.byPartition.map(
							({ partition }) => partition,
						),
						ownNetwork: "degraded",
					}),
				),
		});
		controller.start();
		await fire();
		expect(readsOf(calls)).toBe(7);
		expect(calls).not.toContain("acquire");
		expect(logs).toContainEqual({
			level: "warn",
			message:
				"Own network degraded, but peers do not vouch for theirs: staying",
		});
		await fire();
		expect(readsOf(calls)).toBe(14);
		expect(calls).not.toContain("step-down");
	});

	test("stays when the peers that vouch hold too few of the partitions", async () => {
		const { controller, calls, fire } = harness({
			writtenSince: () => [
				peerHeartbeat({ endpoint: "http://a", partitions: [0, 1] }),
				peerHeartbeat({ endpoint: "http://b", partitions: [2, 3] }),
			],
		});
		controller.start();
		await fire();
		expect(readsOf(calls)).toBe(7);
		expect(calls).not.toContain("acquire");
	});

	test("a baseline that cannot be read keeps the worker in", async () => {
		const { controller, calls, logs, fire } = harness({
			writtenSince: healthyPeers,
			baselineFails: true,
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers"]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Peer heartbeats could not be read",
		});
	});

	test("stays when no permit is granted", async () => {
		const { controller, calls, logs, fire } = harness({
			writtenSince: healthyPeers,
			permit: { ok: false, reason: "all_taken" },
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "read-peers", "acquire"]);
		expect(logs).toContainEqual({
			level: "error",
			message:
				"Own network degraded and peers healthy, but no step-down permit: staying",
		});
	});

	test("a network that recovered before the permit landed keeps the worker in and gives the permit back", async () => {
		const { controller, calls, logs, fire } = harness({
			writtenSince: healthyPeers,
			currentVerdict: () => ({ ...DEGRADED, state: "healthy" }),
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "read-peers", "acquire", "release"]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Own network recovered before the step-down: staying",
		});
	});

	test("a worker that owns nothing never checks", async () => {
		const { controller, calls, fire } = harness({
			writtenSince: healthyPeers,
			owns: false,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([]);
	});

	test("a permit that could not be given back after a recovery is released again at stop", async () => {
		const { controller, calls, fire } = harness({
			writtenSince: healthyPeers,
			currentVerdict: () => ({ ...DEGRADED, state: "healthy" }),
			releaseFailures: 1,
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "read-peers", "acquire", "release"]);
		await controller.stop();
		expect(calls).toEqual([
			"read-peers",
			"read-peers",
			"acquire",
			"release",
			"release",
		]);
	});

	test("stop waits for a check in flight, which then takes no permit and steps nothing down", async () => {
		const gate = Promise.withResolvers<void>();
		const { controller, calls, fire } = harness({
			writtenSince: healthyPeers,
			readPeersGate: gate.promise,
		});
		controller.start();
		await fire();
		const stopping = controller.stop();
		gate.resolve();
		await stopping;
		expect(calls).toEqual(["read-peers"]);
	});

	test("stop lets go of the verdicts and releases a permit it holds", async () => {
		const { controller, calls, fire } = harness({ writtenSince: healthyPeers });
		controller.start();
		await fire();
		await controller.stop();
		expect(calls.at(-1)).toBe("release");
		await fire();
		expect(calls.filter((call) => call === "acquire")).toHaveLength(1);
	});
});
