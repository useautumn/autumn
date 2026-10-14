import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { attachPrimaryForkRecycling } from "@/utils/memory/forkRecycling/attachForkRecycling.js";
import {
	createRecycleCoordinator,
	type RecycleCoordinator,
} from "@/utils/memory/forkRecycling/recycleCoordinator.js";
import { getForkRecycleConfig } from "@/utils/memory/forkRecycling/recyclePolicy.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Harness = {
	coordinator: RecycleCoordinator;
	forked: string[];
	drained: string[];
	aborted: string[];
	killed: string[];
	respawned: string[];
};

const createHarness = ({
	bootTimeoutMs = 5_000,
	drainCompletionTimeoutMs = 5_000,
}: {
	bootTimeoutMs?: number;
	drainCompletionTimeoutMs?: number;
} = {}): Harness => {
	const forked: string[] = [];
	const drained: string[] = [];
	const aborted: string[] = [];
	const killed: string[] = [];
	const respawned: string[] = [];
	let nextForkId = 100;

	const coordinator = createRecycleCoordinator({
		forkReplacement: () => {
			const id = `fork-${nextForkId++}`;
			forked.push(id);
			return id;
		},
		sendDrain: (workerId) => drained.push(workerId),
		sendAbort: (workerId) => aborted.push(workerId),
		killWorker: (workerId) => killed.push(workerId),
		respawn: (workerId) => {
			respawned.push(workerId);
			return `respawn-of-${workerId}`;
		},
		replacementBootTimeoutMs: bootTimeoutMs,
		drainCompletionTimeoutMs,
		log: () => {},
	});

	return { coordinator, forked, drained, aborted, killed, respawned };
};

describe("drain completion deadline survives cycle churn", () => {
	test("control: a drained worker that never exits is killed", async () => {
		const { coordinator, forked, killed } = createHarness({
			drainCompletionTimeoutMs: 40,
		});

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		await sleep(120);

		expect(killed).toContain("w1");
	});

	test("replacement dying after listening must not disarm the old worker's deadline", async () => {
		const { coordinator, forked, drained, killed } = createHarness({
			drainCompletionTimeoutMs: 40,
		});

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		expect(drained).toEqual(["w1"]);

		coordinator.handleWorkerExit({ workerId: forked[0] });
		await sleep(120);

		expect(killed).toContain("w1");
	});

	test("a queued cycle must not disarm the previous drain's deadline", async () => {
		const { coordinator, forked, killed } = createHarness({
			drainCompletionTimeoutMs: 40,
		});

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		coordinator.handleRecycleRequest({ workerId: "w2" });

		coordinator.handleWorkerExit({ workerId: forked[0] });
		await sleep(120);

		expect(killed).toContain("w1");
	});

	test("a dead worker left in the pending queue gets no replacement forked", () => {
		const { coordinator, forked } = createHarness();

		coordinator.handleWorkerExit({ workerId: "b0" });

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });

		coordinator.handleRecycleRequest({ workerId: forked[0] });
		coordinator.handleWorkerExit({ workerId: forked[0] });

		expect(forked).toHaveLength(1);
	});

	test("a dead replacement's request latch is cleared, not left stale", () => {
		const { coordinator, forked } = createHarness();

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });

		coordinator.handleRecycleRequest({ workerId: forked[0] });
		coordinator.handleWorkerExit({ workerId: forked[0] });
		coordinator.handleWorkerExit({ workerId: "w1" });

		const forkedBefore = forked.length;
		coordinator.handleRecycleRequest({ workerId: forked[0] });
		expect(forked.length).toBe(forkedBefore + 1);
	});

	test("old worker exiting normally leaves no stray kill behind", async () => {
		const { coordinator, forked, killed } = createHarness({
			drainCompletionTimeoutMs: 40,
		});

		coordinator.handleRecycleRequest({ workerId: "w1" });
		coordinator.handleWorkerListening({ workerId: forked[0] });
		coordinator.handleWorkerExit({ workerId: "w1" });
		await sleep(120);

		expect(killed).toHaveLength(0);
	});
});

describe("interval flooring", () => {
	const ENV_KEYS = [
		"FORK_RECYCLE_CHECK_INTERVAL_MS",
		"FORK_RECYCLE_DRAIN_TIMEOUT_MS",
	] as const;
	const saved = new Map<string, string | undefined>();

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			saved.set(key, process.env[key]);
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			const value = saved.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test("sub-second intervals floor at 1s instead of hot-looping", () => {
		process.env.FORK_RECYCLE_CHECK_INTERVAL_MS = "1";
		process.env.FORK_RECYCLE_DRAIN_TIMEOUT_MS = "500";
		const config = getForkRecycleConfig();
		expect(config.checkIntervalMs).toBe(1_000);
		expect(config.drainTimeoutMs).toBe(1_000);
	});

	test("fractional and exponent-notation values still floor", () => {
		process.env.FORK_RECYCLE_CHECK_INTERVAL_MS = "0.5";
		process.env.FORK_RECYCLE_DRAIN_TIMEOUT_MS = "1e-3";
		const config = getForkRecycleConfig();
		expect(config.checkIntervalMs).toBe(1_000);
		expect(config.drainTimeoutMs).toBe(1_000);
	});

	test("values at or above the floor are untouched", () => {
		process.env.FORK_RECYCLE_CHECK_INTERVAL_MS = "1000";
		process.env.FORK_RECYCLE_DRAIN_TIMEOUT_MS = "45000";
		const config = getForkRecycleConfig();
		expect(config.checkIntervalMs).toBe(1_000);
		expect(config.drainTimeoutMs).toBe(45_000);
	});
});

class FakeWorker extends EventEmitter {
	dead = false;
	sent: unknown[] = [];
	killedTimes = 0;
	constructor(public id: number) {
		super();
	}
	isDead() {
		return this.dead;
	}
	send(message: unknown, callback?: (error: Error | null) => void) {
		if (this.dead) {
			const error = new Error("channel closed");
			if (callback) {
				callback(error);
				return false;
			}
			throw error;
		}
		this.sent.push(message);
		callback?.(null);
		return true;
	}
	kill() {
		this.killedTimes++;
	}
}

const createFakeCluster = () => {
	const emitter = new EventEmitter();
	const workers: FakeWorker[] = [];
	let nextId = 1;
	const clusterModule = Object.assign(emitter, {
		fork: () => {
			const worker = new FakeWorker(nextId++);
			workers.push(worker);
			return worker;
		},
	});
	return { clusterModule, workers, emitter };
};

describe("primary-side message guards", () => {
	const logger = {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
	};

	test("a recycle request from a dead worker starts no cycle", () => {
		const { clusterModule, workers, emitter } = createFakeCluster();
		// biome-ignore lint/suspicious/noExplicitAny: minimal cluster stand-in
		attachPrimaryForkRecycling({
			clusterModule: clusterModule as any,
			shouldRespawn: () => true,
			logger: logger as any,
		});

		const alive = new FakeWorker(50);
		const dead = new FakeWorker(51);
		dead.dead = true;

		emitter.emit("message", dead, { type: "fork-recycle:request" });
		expect(workers).toHaveLength(0);

		emitter.emit("message", alive, { type: "fork-recycle:request" });
		expect(workers).toHaveLength(1);
	});

	test("a failed drain send does not throw out of the coordinator", () => {
		const { clusterModule, workers, emitter } = createFakeCluster();
		// biome-ignore lint/suspicious/noExplicitAny: minimal cluster stand-in
		attachPrimaryForkRecycling({
			clusterModule: clusterModule as any,
			shouldRespawn: () => true,
			logger: logger as any,
		});

		const worker = new FakeWorker(60);
		emitter.emit("message", worker, { type: "fork-recycle:request" });
		const replacement = workers[0];

		worker.dead = true;
		expect(() => emitter.emit("listening", replacement)).not.toThrow();
	});
});

const mulberry32 = (seed: number) => {
	let state = seed;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

type TrialResult = {
	seed: number;
	aliveAtEnd: number;
	peakAlive: number;
	converged: boolean;
	corpseMessages: string[];
	history: string[];
};

const runTrial = ({
	seed,
	steps,
	forkCount,
	ageGateSteps = 6,
	allowCrashes = true,
}: {
	seed: number;
	steps: number;
	forkCount: number;
	ageGateSteps?: number;
	allowCrashes?: boolean;
}): TrialResult => {
	const rand = mulberry32(seed);
	const history: string[] = [];
	let nextId = 0;

	const booting = new Set<string>();
	const serving = new Set<string>();
	const draining = new Set<string>();
	const requested = new Set<string>();
	const listenedAt = new Map<string, number>();
	const dead = new Set<string>();
	const corpseMessages: string[] = [];
	let peakAlive = 0;

	const spawn = (tag: string) => {
		const id = `${tag}-${nextId++}`;
		booting.add(id);
		return id;
	};

	const coordinator = createRecycleCoordinator({
		forkReplacement: () => spawn("repl"),
		respawn: () => spawn("resp"),
		sendDrain: (workerId) => {
			if (dead.has(workerId)) {
				corpseMessages.push(`drain -> dead ${workerId}`);
				return;
			}
			draining.add(workerId);
		},
		sendAbort: (workerId) => {
			requested.delete(workerId);
		},
		killWorker: (workerId) => {
			if (dead.has(workerId)) {
				corpseMessages.push(`kill -> dead ${workerId}`);
				return;
			}
			draining.add(workerId);
		},
		replacementBootTimeoutMs: 1_000_000,
		drainCompletionTimeoutMs: 1_000_000,
		log: () => {},
	});

	for (let i = 0; i < forkCount; i++) {
		const id = `boot-${nextId++}`;
		booting.add(id);
	}

	const pick = <T>(items: Set<T>): T | undefined => {
		if (items.size === 0) return undefined;
		const list = [...items];
		return list[Math.floor(rand() * list.length)];
	};

	let stepIndex = 0;
	const listen = (id: string) => {
		booting.delete(id);
		serving.add(id);
		listenedAt.set(id, stepIndex);
		history.push(`listen ${id}`);
		coordinator.handleWorkerListening({ workerId: id });
	};

	const exit = (id: string) => {
		booting.delete(id);
		serving.delete(id);
		draining.delete(id);
		requested.delete(id);
		dead.add(id);
		history.push(`exit ${id}`);
		coordinator.handleWorkerExit({ workerId: id });
	};

	for (let step = 0; step < steps; step++) {
		stepIndex = step;
		const roll = rand();
		if (roll < 0.35) {
			const id = pick(booting);
			if (id) listen(id);
		} else if (roll < 0.6) {
			const id = pick(draining);
			if (id) exit(id);
		} else if (roll < 0.8) {
			const candidates = new Set(
				[...serving].filter(
					(id) =>
						!requested.has(id) &&
						!draining.has(id) &&
						step - (listenedAt.get(id) ?? 0) >= ageGateSteps,
				),
			);
			const id = pick(candidates);
			if (id) {
				requested.add(id);
				history.push(`request ${id}`);
				coordinator.handleRecycleRequest({ workerId: id });
			}
		} else if (allowCrashes) {
			const id = pick(serving) ?? pick(booting);
			if (id) exit(id);
		}
		peakAlive = Math.max(peakAlive, booting.size + serving.size);
	}

	let converged = false;
	for (let round = 0; round < 500; round++) {
		if (booting.size === 0 && draining.size === 0) {
			converged = true;
			break;
		}
		for (const id of [...booting]) listen(id);
		for (const id of [...draining]) exit(id);
	}

	return {
		seed,
		aliveAtEnd: booting.size + serving.size,
		peakAlive,
		converged,
		corpseMessages,
		history,
	};
};

describe("coordinator fork-count invariant under random event streams", () => {
	test("alive forks always return to N after quiescing", () => {
		const forkCount = 3;
		const failures: TrialResult[] = [];

		for (let seed = 1; seed <= 400; seed++) {
			const result = runTrial({ seed, steps: 60, forkCount });
			if (!result.converged || result.aliveAtEnd !== forkCount) {
				failures.push(result);
			}
		}

		if (failures.length > 0) {
			const worst = failures[0];
			throw new Error(
				`${failures.length}/400 trials broke the invariant. seed=${worst.seed} alive=${worst.aliveAtEnd} converged=${worst.converged}\n${worst.history.slice(-25).join("\n")}`,
			);
		}
		expect(failures).toHaveLength(0);
	});

	test("no drain or kill is ever aimed at a worker that already exited", () => {
		const offenders: TrialResult[] = [];

		for (let seed = 1; seed <= 400; seed++) {
			const result = runTrial({ seed, steps: 60, forkCount: 3 });
			if (result.corpseMessages.length > 0) offenders.push(result);
		}

		if (offenders.length > 0) {
			const worst = offenders[0];
			throw new Error(
				`${offenders.length}/400 trials messaged a dead worker. seed=${worst.seed}\n${worst.corpseMessages.join("\n")}\n--- tail ---\n${worst.history.slice(-15).join("\n")}`,
			);
		}
		expect(offenders).toHaveLength(0);
	});

	test("a crash-free recycle runs exactly one surplus fork", () => {
		const forkCount = 3;
		for (let seed = 1; seed <= 200; seed++) {
			const { peakAlive } = runTrial({
				seed,
				steps: 40,
				forkCount,
				allowCrashes: false,
			});
			expect(peakAlive).toBeLessThanOrEqual(forkCount + 1);
		}
	});
});
