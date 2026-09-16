/**
 * Replay hydration coordinator regressions found in parent review: only a newly
 * initialized customer carries fresh parity, public operations reject after
 * close before any I/O, a late initialize reply cannot outlive the deadline or
 * close, and an aborted identity stays registered until its load settles.
 *
 * The duplicate rule is canonical: the writer answers a duplicate with the
 * submitted baseline (writer actions/decide.ts), so later tracks may already
 * have moved actual state, and any older expectation of duplicate parity here
 * or elsewhere is stale.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckDecision,
	type CustomerState,
	findCustomerEntitlementsForFeature,
	type InitializationDecision,
	type InitializeCommand,
} from "@autumn/balance-engine";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import type {
	ReplayHydrationClock,
	ReplayHydrationSelection,
	ReplayHydrationSource,
	ReplayHydrationSourceResult,
	ReplayHydrationWorkerClient,
} from "@/internal/balances/replay/replayHydrationContracts.js";
import {
	ReplayHydrationAbortedError,
	ReplayHydrationClosedError,
	ReplayHydrationDeadlineError,
} from "@/internal/balances/replay/replayHydrationErrors.js";
import {
	createLoadedSource,
	createNotInitializedError,
	createReplayHydrationFixture,
	tick,
} from "./replay-hydration-fixture.js";

const ORIGIN_MS = 10_000;
const DEADLINE_MS = 1_000;

type WorkerCallCounts = { check: number; track: number; initialize: number };

type WorkerClientStub = Readonly<{
	client: ReplayHydrationWorkerClient;
	calls: WorkerCallCounts;
}>;

type ControlledClock = ReplayHydrationClock &
	Readonly<{
		advance: (durationMs: number) => void;
		pendingTimerCount: () => number;
	}>;

type SettledState<Value> =
	| Readonly<{ kind: "resolved"; value: Value }>
	| Readonly<{ kind: "rejected"; cause: unknown }>;

type PendingState = Readonly<{ kind: "pending" }>;

type Deferred<Value> = Readonly<{
	promise: Promise<Value>;
	resolve: (value: Value) => void;
}>;

async function rejectNotInitialized(): Promise<never> {
	throw createNotInitializedError();
}

function createWorkerClientStub({
	check,
	initialize,
	track = rejectNotInitialized,
}: {
	check: ReplayHydrationWorkerClient["check"];
	initialize: ReplayHydrationWorkerClient["initialize"];
	track?: ReplayHydrationWorkerClient["track"];
}): WorkerClientStub {
	const calls: WorkerCallCounts = { check: 0, track: 0, initialize: 0 };
	const client: ReplayHydrationWorkerClient = {
		check: (params) => {
			calls.check++;
			return check(params);
		},
		track: (params) => {
			calls.track++;
			return track(params);
		},
		initialize: (params) => {
			calls.initialize++;
			return initialize(params);
		},
	};
	return { client, calls };
}

/** Time advances without firing timers: a late timer cannot license success. */
function createControlledClock(): ControlledClock {
	const timers = new Map<number, () => void>();
	let nextTimerId = 1;
	let nowMs = ORIGIN_MS;
	return {
		now: () => nowMs,
		setTimeout: (callback) => {
			const timerId = nextTimerId++;
			timers.set(timerId, callback);
			return timerId;
		},
		clearTimeout: (timer) => {
			timers.delete(timer as number);
		},
		advance: (durationMs) => {
			nowMs += durationMs;
		},
		pendingTimerCount: () => timers.size,
	};
}

function createDeferred<Value>(): Deferred<Value> {
	let capturedResolve: ((value: Value) => void) | undefined;
	const promise = new Promise<Value>((resolve) => {
		capturedResolve = resolve;
	});
	if (!capturedResolve)
		throw new Error("Deferred resolver must be captured synchronously");
	return { promise, resolve: capturedResolve };
}

async function flush({ times = 4 }: { times?: number } = {}): Promise<void> {
	for (let index = 0; index < times; index++) await tick();
}

function settledStateOf<Value>({
	promise,
}: {
	promise: Promise<Value>;
}): Promise<SettledState<Value>> {
	return promise.then(
		(value): SettledState<Value> => ({ kind: "resolved", value }),
		(cause): SettledState<Value> => ({ kind: "rejected", cause }),
	);
}

/** Bounded wait so a regression reports a pending promise instead of hanging. */
function outcomeWithinTicks<Value>({
	settled,
}: {
	settled: Promise<SettledState<Value>>;
}): Promise<SettledState<Value> | PendingState> {
	const pending: PendingState = { kind: "pending" };
	return Promise.race([settled, flush({ times: 6 }).then(() => pending)]);
}

/** Returns the whole state when it is not a rejection so failures stay readable. */
function rejectionCauseOf<Value>({
	state,
}: {
	state: SettledState<Value> | PendingState;
}): unknown {
	return state.kind === "rejected" ? state.cause : state;
}

function checkDecisionOf({ state }: { state: CustomerState }): CheckDecision {
	const [balanceSnapshot] = findCustomerEntitlementsForFeature({
		state,
		featureId: "messages",
	});
	if (!balanceSnapshot)
		throw new Error("Fixture state must expose a messages entitlement");
	return {
		kind: "decided",
		allowed: true,
		reason: null,
		balance: balanceSnapshot.balance,
		balanceSnapshot,
		requiredBalance: 0,
		revision: state.revision,
	};
}

describe("Replay hydration parity evidence", () => {
	test("keeps a worker duplicate an idempotent success without parity", async () => {
		const fixture = createReplayHydrationFixture();
		const worker = createWorkerClientStub({
			check: rejectNotInitialized,
			initialize: async () => ({ kind: "duplicate", state: fixture.state }),
		});
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state }),
			client: worker.client,
		});

		const result = await coordinator.prewarm({ selection: fixture.selection });

		expect(result).toEqual({ kind: "duplicate", freshParity: false });
		expect(worker.calls.initialize).toBe(1);
		await coordinator.close();
	});

	test("grants fresh parity only to a newly initialized customer", async () => {
		const fixture = createReplayHydrationFixture();
		const decisions: readonly InitializationDecision[] = [
			{ kind: "initialized", state: fixture.state },
			{ kind: "duplicate", state: fixture.state },
			{ kind: "already_initialized" },
		];

		for (const decision of decisions) {
			const worker = createWorkerClientStub({
				check: rejectNotInitialized,
				initialize: async () => decision,
			});
			const coordinator = createReplayHydrationCoordinator({
				source: createLoadedSource({ state: fixture.state }),
				client: worker.client,
			});

			await expect(
				coordinator.prewarm({ selection: fixture.selection }),
			).resolves.toEqual({
				kind: decision.kind,
				freshParity: decision.kind === "initialized",
			});
			await coordinator.close();
		}
	});

	test("treats an already ready customer as a parity-free success", async () => {
		const fixture = createReplayHydrationFixture();
		const worker = createWorkerClientStub({
			check: async () => checkDecisionOf({ state: fixture.state }),
			initialize: async () => ({ kind: "initialized", state: fixture.state }),
		});
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state }),
			client: worker.client,
		});

		await expect(
			coordinator.prewarm({ selection: fixture.selection }),
		).resolves.toEqual({ kind: "already_ready", freshParity: false });
		expect(worker.calls.initialize).toBe(0);
		await coordinator.close();
	});
});

describe("Replay hydration lifetime guards", () => {
	test("rejects public operations after close before worker or source", async () => {
		const fixture = createReplayHydrationFixture();
		let sourceLoads = 0;
		async function load(): Promise<ReplayHydrationSourceResult> {
			sourceLoads++;
			return { kind: "loaded", state: fixture.state };
		}
		const worker = createWorkerClientStub({
			check: rejectNotInitialized,
			initialize: async () => ({ kind: "initialized", state: fixture.state }),
		});
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state, onLoad: load }),
			client: worker.client,
		});

		await coordinator.close();

		await expect(
			coordinator.check({
				selection: fixture.selection,
				command: fixture.checkCommand,
			}),
		).rejects.toBeInstanceOf(ReplayHydrationClosedError);
		await expect(
			coordinator.track({
				selection: fixture.selection,
				command: fixture.trackCommand,
			}),
		).rejects.toBeInstanceOf(ReplayHydrationClosedError);
		await expect(
			coordinator.prewarm({ selection: fixture.selection }),
		).rejects.toBeInstanceOf(ReplayHydrationClosedError);
		expect(worker.calls).toEqual({ check: 0, track: 0, initialize: 0 });
		expect(sourceLoads).toBe(0);
	});

	test("refuses success when initialize returns after the deadline", async () => {
		const fixture = createReplayHydrationFixture();
		const clock = createControlledClock();
		const gate = createDeferred<InitializationDecision>();
		const worker = createWorkerClientStub({
			check: rejectNotInitialized,
			initialize: () => gate.promise,
		});
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state }),
			client: worker.client,
			config: { deadlineMs: DEADLINE_MS },
			clock,
		});
		const prewarmed = settledStateOf({
			promise: coordinator.prewarm({ selection: fixture.selection }),
		});
		await flush();
		expect(worker.calls.initialize).toBe(1);

		clock.advance(DEADLINE_MS + 1);
		gate.resolve({ kind: "initialized", state: fixture.state });

		expect(rejectionCauseOf({ state: await prewarmed })).toBeInstanceOf(
			ReplayHydrationDeadlineError,
		);
		expect(worker.calls.check).toBe(1);
		expect(clock.pendingTimerCount()).toBe(0);
		await coordinator.close();
	});

	test("rejects a late initialize reply once the coordinator closes", async () => {
		const fixture = createReplayHydrationFixture();
		const clock = createControlledClock();
		const gate = createDeferred<InitializationDecision>();
		const worker = createWorkerClientStub({
			check: rejectNotInitialized,
			initialize: () => gate.promise,
		});
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({ state: fixture.state }),
			client: worker.client,
			config: { deadlineMs: DEADLINE_MS },
			clock,
		});
		const prewarmed = settledStateOf({
			promise: coordinator.prewarm({ selection: fixture.selection }),
		});
		await flush();
		expect(worker.calls.initialize).toBe(1);

		const closed = coordinator.close();
		gate.resolve({ kind: "initialized", state: fixture.state });
		await closed;

		expect(rejectionCauseOf({ state: await prewarmed })).toBeInstanceOf(
			ReplayHydrationClosedError,
		);
		expect(clock.pendingTimerCount()).toBe(0);
	});
});

describe("Replay hydration abort settlement", () => {
	test("keeps an aborted identity registered until physical settlement", async () => {
		const fixture = createReplayHydrationFixture();
		const { customerId } = fixture.selection.identity;
		const otherFixture = createReplayHydrationFixture({
			identity: { ...fixture.selection.identity, customerId: "cus_replay_two" },
		});
		const otherCustomerId = otherFixture.selection.identity.customerId;
		const abandonedLoad = createDeferred<ReplayHydrationSourceResult>();
		const loadsByCustomerId = new Map<string, number>();
		const initializedCustomerIds: string[] = [];

		async function load({
			selection,
		}: {
			selection: ReplayHydrationSelection;
			signal: AbortSignal;
		}): Promise<ReplayHydrationSourceResult> {
			const loaded = selection.identity.customerId;
			loadsByCustomerId.set(loaded, (loadsByCustomerId.get(loaded) ?? 0) + 1);
			// Deliberately ignores the signal: physical work outlives logical aborts.
			if (loaded === customerId) return abandonedLoad.promise;
			return { kind: "loaded", state: otherFixture.state };
		}

		async function recordInitialize({
			command,
		}: {
			command: InitializeCommand;
		}): Promise<InitializationDecision> {
			initializedCustomerIds.push(command.identity.customerId);
			return { kind: "initialized", state: command.state };
		}

		const source: ReplayHydrationSource = { load };
		const worker = createWorkerClientStub({
			check: rejectNotInitialized,
			initialize: recordInitialize,
		});
		const coordinator = createReplayHydrationCoordinator({
			source,
			client: worker.client,
			config: { maxActive: 2 },
		});
		const controller = new AbortController();
		const aborted = settledStateOf({
			promise: coordinator.prewarm({
				selection: fixture.selection,
				signal: controller.signal,
			}),
		});
		await flush();
		expect(loadsByCustomerId.get(customerId)).toBe(1);

		controller.abort();
		expect(rejectionCauseOf({ state: await aborted })).toBeInstanceOf(
			ReplayHydrationAbortedError,
		);

		const retried = settledStateOf({
			promise: coordinator.prewarm({ selection: fixture.selection }),
		});
		const retriedOutcome = await outcomeWithinTicks({ settled: retried });

		expect(loadsByCustomerId.get(customerId)).toBe(1);
		expect(rejectionCauseOf({ state: retriedOutcome })).toBeInstanceOf(
			ReplayHydrationAbortedError,
		);
		await expect(
			coordinator.prewarm({ selection: otherFixture.selection }),
		).resolves.toEqual({ kind: "initialized", freshParity: true });
		expect(loadsByCustomerId.get(otherCustomerId)).toBe(1);

		abandonedLoad.resolve({ kind: "loaded", state: fixture.state });
		await coordinator.close();
		expect(initializedCustomerIds).toEqual([otherCustomerId]);
	});
});
