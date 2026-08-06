import { afterEach, describe, expect, test } from "bun:test";
import {
	createRecycleCoordinator,
	type RecycleCoordinator,
} from "@/utils/memory/forkRecycling/recycleCoordinator.js";
import { shouldRequestRecycle } from "@/utils/memory/forkRecycling/recyclePolicy.js";
import { createWorkerDrainer } from "@/utils/memory/forkRecycling/workerDrainer.js";

const MB = 1024 * 1024;

describe("shouldRequestRecycle", () => {
	const base = {
		rssBytes: 4096 * MB,
		thresholdBytes: 3072 * MB,
		ageMs: 60 * 60_000,
		minAgeMs: 30 * 60_000,
	};

	test("fires when rss is over threshold and the fork is old enough", () => {
		expect(shouldRequestRecycle(base)).toBe(true);
	});

	test("stays quiet under the threshold", () => {
		expect(shouldRequestRecycle({ ...base, rssBytes: 2048 * MB })).toBe(false);
	});

	test("never recycles a young fork regardless of rss", () => {
		expect(shouldRequestRecycle({ ...base, ageMs: 5 * 60_000 })).toBe(false);
	});
});

type CoordinatorHarness = {
	coordinator: RecycleCoordinator;
	forked: string[];
	drained: string[];
	aborted: string[];
	respawned: string[];
};

/** Coordinator with capture-everything callbacks; tests drive the lifecycle
 *  through the handle* methods directly. */
const createHarness = (): CoordinatorHarness => {
	const forked: string[] = [];
	const drained: string[] = [];
	const aborted: string[] = [];
	const respawned: string[] = [];
	let nextForkId = 100;

	const coordinator = createRecycleCoordinator({
		forkReplacement: () => {
			const id = `fork-${nextForkId++}`;
			forked.push(id);
			return id;
		},
		sendDrain: (workerId) => {
			drained.push(workerId);
		},
		sendAbort: (workerId) => {
			aborted.push(workerId);
		},
		respawn: (workerId) => {
			respawned.push(workerId);
		},
		log: () => {},
	});

	return { coordinator, forked, drained, aborted, respawned };
};

describe("createRecycleCoordinator", () => {
	test("request forks a replacement before any drain is sent", () => {
		const { coordinator, forked, drained } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });

		expect(forked).toHaveLength(1);
		expect(drained).toHaveLength(0);
	});

	test("drains the old worker only once its replacement is listening", () => {
		const { coordinator, forked, drained } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });

		expect(drained).toEqual(["w1"]);
	});

	test("an unrelated worker coming up never triggers a drain", () => {
		const { coordinator, drained } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: "boot-time-fork" });

		expect(drained).toHaveLength(0);
	});

	test("serializes concurrent requests: second starts after first completes", () => {
		const { coordinator, forked, drained } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleRecycleRequest({ workerId: "w2" });

		// Only one replacement forked so far.
		expect(forked).toHaveLength(1);

		coordinator.handleWorkerListening({ workerId: forked[0] });
		expect(drained).toEqual(["w1"]);

		// w1's exit completes the cycle and releases w2's.
		coordinator.handleWorkerExit({ workerId: "w1" });
		expect(forked).toHaveLength(2);

		coordinator.handleWorkerListening({ workerId: forked[1] });
		expect(drained).toEqual(["w1", "w2"]);
	});

	test("duplicate requests from the same worker are idempotent", () => {
		const { coordinator, forked } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleRecycleRequest({ workerId: "w1" });

		expect(forked).toHaveLength(1);
	});

	test("expected exit of a draining worker is not respawned", () => {
		const { coordinator, forked, respawned } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		coordinator.handleWorkerExit({ workerId: "w1" });

		expect(respawned).toHaveLength(0);
	});

	test("a crash (unexpected exit) is respawned as before", () => {
		const { coordinator, respawned } = createHarness();

		coordinator.handleWorkerExit({ workerId: "w-crashed" });

		expect(respawned).toEqual(["w-crashed"]);
	});

	test("old worker crashing pre-drain is NOT respawned — its replacement adopts the slot", () => {
		const { coordinator, forked, drained, respawned } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleRecycleRequest({ workerId: "w2" });
		// w1 dies before its replacement reports listening.
		coordinator.handleWorkerExit({ workerId: "w1" });

		// No extra fork: the already-booting replacement is w1's respawn.
		expect(respawned).toHaveLength(0);
		expect(forked).toHaveLength(1);

		// Replacement comes up, takes the slot without a drain, then w2's
		// queued cycle starts.
		coordinator.handleWorkerListening({ workerId: forked[0] });
		expect(drained).toHaveLength(0);
		expect(forked).toHaveLength(2);
		coordinator.handleWorkerListening({ workerId: forked[1] });
		expect(drained).toEqual(["w2"]);
	});

	test("replacement dying while booting aborts without a surplus fork and lets the worker re-request", () => {
		const { coordinator, forked, drained, aborted, respawned } =
			createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerExit({ workerId: forked[0] });

		// Old fork still serves: nothing to respawn, worker told to re-arm.
		expect(respawned).toHaveLength(0);
		expect(aborted).toEqual(["w1"]);
		expect(drained).toHaveLength(0);

		// The re-request starts a fresh cycle.
		coordinator.handleRecycleRequest({ workerId: "w1" });
		expect(forked).toHaveLength(2);
	});

	test("replacement dying after drain was sent is respawned and the old exit stays expected", () => {
		const { coordinator, forked, drained, respawned } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		expect(drained).toEqual(["w1"]);

		// Replacement crashes while w1 is already draining.
		coordinator.handleWorkerExit({ workerId: forked[0] });
		expect(respawned).toEqual([forked[0]]);

		// w1's exit is still a recycle completion, not a crash.
		expect(coordinator.handleWorkerExit({ workerId: "w1" })).toBe(true);
	});

	test("adopted replacement dying while booting refills the crashed slot", () => {
		const { coordinator, forked, respawned } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerExit({ workerId: "w1" });
		// Both the old worker and its adopted replacement are gone: refill.
		coordinator.handleWorkerExit({ workerId: forked[0] });

		expect(respawned).toEqual([forked[0]]);
	});
});

describe("createWorkerDrainer", () => {
	type FakeServer = {
		close: (callback: () => void) => void;
		closeIdleConnections?: () => void;
	};

	const exits: number[] = [];
	afterEach(() => {
		exits.length = 0;
	});

	test("closes the server, then exits 0 when all connections finish", async () => {
		const closeCallbacks: (() => void)[] = [];
		let idleSweeps = 0;
		const server: FakeServer = {
			close: (callback) => {
				closeCallbacks.push(callback);
			},
			closeIdleConnections: () => {
				idleSweeps++;
			},
		};

		const drainer = createWorkerDrainer({
			server,
			exit: (code) => {
				exits.push(code);
			},
			drainTimeoutMs: 5_000,
			idleSweepIntervalMs: 10,
			log: () => {},
		});

		drainer.drain();
		expect(exits).toHaveLength(0);

		// Sweeps start one interval in, never at t=0 (header-retirement beat).
		expect(idleSweeps).toBe(0);
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(idleSweeps).toBeGreaterThanOrEqual(1);

		closeCallbacks[0]?.();
		expect(exits).toEqual([0]);
	});

	test("exits 0 at the drain timeout even if connections never finish", async () => {
		const server: FakeServer = {
			close: () => {},
		};

		const drainer = createWorkerDrainer({
			server,
			exit: (code) => {
				exits.push(code);
			},
			drainTimeoutMs: 30,
			idleSweepIntervalMs: 10,
			log: () => {},
		});

		drainer.drain();
		expect(exits).toHaveLength(0);

		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(exits).toEqual([0]);
	});

	test("onDrainStart fires before the server begins closing", () => {
		const order: string[] = [];
		const server: FakeServer = {
			close: () => {
				order.push("close");
			},
		};

		const drainer = createWorkerDrainer({
			server,
			exit: () => {},
			drainTimeoutMs: 5_000,
			idleSweepIntervalMs: 10,
			onDrainStart: () => {
				order.push("drainStart");
			},
			log: () => {},
		});

		drainer.drain();
		expect(order).toEqual(["drainStart", "close"]);
	});

	test("drain is idempotent — a second call neither double-closes nor double-exits", async () => {
		const closeCallbacks: (() => void)[] = [];
		const server: FakeServer = {
			close: (callback) => {
				closeCallbacks.push(callback);
			},
		};

		const drainer = createWorkerDrainer({
			server,
			exit: (code) => {
				exits.push(code);
			},
			drainTimeoutMs: 5_000,
			idleSweepIntervalMs: 10,
			log: () => {},
		});

		drainer.drain();
		drainer.drain();
		closeCallbacks[0]?.();

		expect(closeCallbacks).toHaveLength(1);
		expect(exits).toEqual([0]);
	});
});
