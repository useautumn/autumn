import { describe, expect, test } from "bun:test";
import type { SlotHeartbeat } from "../../../../src/blueGreen/types/slotHeartbeat.js";
import type { OwnNetworkVerdict } from "../../../../src/health/ownNetwork/types/ownNetworkVerdict.js";
import { createStepDownController } from "../../../../src/health/stepDown/createStepDownController.js";
import type { StepDownPermitResult } from "../../../../src/health/stepDown/types/stepDownPermits.js";

const WALL_START = Date.parse("2026-10-16T19:39:04Z");

function heartbeatOf({
	endpoint,
	writtenAt,
	lastSendAckAt,
	ownNetwork = "healthy",
}: {
	endpoint: string;
	writtenAt: number;
	lastSendAckAt: number;
	ownNetwork?: "healthy" | "degraded";
}): SlotHeartbeat {
	return {
		serviceName: "balance-workers",
		fleetId: "fleet",
		deployment: "prod",
		endpoint,
		instanceId: endpoint,
		pid: 1,
		identity: { serviceArn: null, imageSha: null },
		declaredActive: true,
		gate: "active",
		storeHealthy: true,
		ok: true,
		checks: {
			kafka: { ok: true, latencyMs: 1 },
			postgres: { ok: true, latencyMs: 1 },
		},
		partitions: {
			prepared: 0,
			ready: 8,
			admitted: 8,
			total: 8,
			byPartition: [],
		},
		work: {
			lastSendAckAt: new Date(lastSendAckAt).toISOString(),
			ownNetwork,
			steppedDown: false,
		},
		startedAt: new Date(WALL_START - 3_600_000).toISOString(),
		writtenAt: new Date(writtenAt).toISOString(),
	};
}

const DEGRADED: OwnNetworkVerdict = {
	state: "degraded",
	at: 10_000,
	windowStartedAt: 7_000,
	segments: 300,
	retransmitRatio: 0.3,
	busyPartitions: 8,
	stalledPartitions: 6,
};

function harness({
	peersAt,
	permit = {
		ok: true,
		permit: { slot: 0, key: "slot-0", acquisitionId: "acquisition-1" },
	},
	owns = true,
	currentVerdict = () => DEGRADED,
	readPeersGate,
	releaseFailures = 0,
}: {
	peersAt: (wall: number) => SlotHeartbeat[];
	permit?: StepDownPermitResult;
	owns?: boolean;
	currentVerdict?: () => OwnNetworkVerdict;
	readPeersGate?: Promise<void>;
	releaseFailures?: number;
}) {
	const time = { now: 10_000, wall: WALL_START };
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
			readPeers: async () => {
				calls.push("read-peers");
				await readPeersGate;
				return { heartbeats: peersAt(time.wall), unreadable: 0 };
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
			wallNow: () => time.wall,
			sleep: async (ms) => {
				time.now += ms;
				time.wall += ms;
			},
		},
		config: {
			selfEndpoint: "http://self",
			peerWaitMs: 6_000,
			peerPollMs: 1_000,
			membershipMs: 300_000,
			skewMs: 1_000,
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

const faultAt = WALL_START - 3_000;

function healthyPeersAt(wall: number): SlotHeartbeat[] {
	return ["http://a", "http://b", "http://c"].map((endpoint) =>
		heartbeatOf({ endpoint, writtenAt: wall - 500, lastSendAckAt: wall - 700 }),
	);
}

describe("step-down controller", () => {
	test("steps down once peers vouch for their own work since the fault and a permit is granted", async () => {
		const { controller, calls, logs, fire } = harness({
			peersAt: healthyPeersAt,
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "acquire", "step-down"]);
		expect(logs).toContainEqual({
			level: "error",
			message: "Own network degraded and peers healthy: stepping down",
		});
		await fire();
		expect(calls).toEqual(["read-peers", "acquire", "step-down"]);
	});

	test("waits for peers to report since the fault, polling until they do", async () => {
		const { controller, calls, fire } = harness({
			peersAt: (wall) =>
				wall < WALL_START + 2_000
					? healthyPeersAt(faultAt - 1_000)
					: healthyPeersAt(wall),
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
			peersAt: (wall) =>
				["http://a", "http://b"].map((endpoint) =>
					heartbeatOf({
						endpoint,
						writtenAt: wall - 500,
						lastSendAckAt: wall - 700,
						ownNetwork: "degraded",
					}),
				),
		});
		controller.start();
		await fire();
		expect(calls.filter((call) => call === "read-peers")).toHaveLength(7);
		expect(calls).not.toContain("acquire");
		expect(logs).toContainEqual({
			level: "warn",
			message:
				"Own network degraded, but peers do not vouch for theirs: staying",
		});
		await fire();
		expect(calls.filter((call) => call === "read-peers")).toHaveLength(14);
		expect(calls).not.toContain("step-down");
	});

	test("stays when no permit is granted", async () => {
		const { controller, calls, logs, fire } = harness({
			peersAt: healthyPeersAt,
			permit: { ok: false, reason: "all_taken" },
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "acquire"]);
		expect(logs).toContainEqual({
			level: "error",
			message:
				"Own network degraded and peers healthy, but no step-down permit: staying",
		});
	});

	test("a network that recovered before the permit landed keeps the worker in and gives the permit back", async () => {
		const { controller, calls, logs, fire } = harness({
			peersAt: healthyPeersAt,
			currentVerdict: () => ({ ...DEGRADED, state: "healthy" }),
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "acquire", "release"]);
		expect(logs).toContainEqual({
			level: "warn",
			message: "Own network recovered before the step-down: staying",
		});
	});

	test("a worker that owns nothing never checks", async () => {
		const { controller, calls, fire } = harness({
			peersAt: healthyPeersAt,
			owns: false,
		});
		controller.start();
		await fire();
		expect(calls).toEqual([]);
	});

	test("a permit that could not be given back after a recovery is released again at stop", async () => {
		const { controller, calls, fire } = harness({
			peersAt: healthyPeersAt,
			currentVerdict: () => ({ ...DEGRADED, state: "healthy" }),
			releaseFailures: 1,
		});
		controller.start();
		await fire();
		expect(calls).toEqual(["read-peers", "acquire", "release"]);
		await controller.stop();
		expect(calls).toEqual(["read-peers", "acquire", "release", "release"]);
	});

	test("stop waits for a check in flight, which then takes no permit and steps nothing down", async () => {
		const gate = Promise.withResolvers<void>();
		const { controller, calls, fire } = harness({
			peersAt: healthyPeersAt,
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
		const { controller, calls, fire } = harness({ peersAt: healthyPeersAt });
		controller.start();
		await fire();
		await controller.stop();
		expect(calls.at(-1)).toBe("release");
		await fire();
		expect(calls.filter((call) => call === "acquire")).toHaveLength(1);
	});
});
