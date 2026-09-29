import type { InitializeReply } from "@autumn/balance-worker-client";
import type {
	ReplayHydrationClock,
	ReplayHydrationConfig,
	ReplayHydrationSource,
	ReplayHydrationWorkerClient,
} from "../replayHydrationContracts.js";
import {
	ReplayHydrationClosedError,
	ReplayHydrationInvalidSelectionError,
} from "../replayHydrationErrors.js";
import type { NormalizedSelection } from "./replaySelection.js";

const DEFAULT_MAX_ACTIVE = 4;
const DEFAULT_MAX_QUEUED = 64;
const DEFAULT_DEADLINE_MS = 5_000;

export type JobSettlement = {
	promise: Promise<InitializeReply>;
	resolve: (decision: InitializeReply) => void;
	reject: (cause?: unknown) => void;
};

/**
 * `physicalPending` outlives logical settlement: an aborted job keeps its slot
 * and its identity registration until the source call it started really ends.
 */
export type HydrationJob = {
	identityKey: string;
	selectionKey: string;
	selection: NormalizedSelection;
	deadlineAt: number;
	controller: AbortController;
	waiters: Set<symbol>;
	settlement: JobSettlement;
	timer: unknown;
	phase: "queued" | "active" | "settled";
	physicalPending: boolean;
	physicalTask: Promise<void> | undefined;
};

export type ReplayHydrationLimits = Readonly<{
	maxActive: number;
	maxQueued: number;
	deadlineMs: number;
}>;

export type ReplayHydrationScope = {
	readonly source: ReplayHydrationSource;
	readonly client: ReplayHydrationWorkerClient;
	readonly clock: ReplayHydrationClock;
	readonly limits: ReplayHydrationLimits;
	readonly currentJobs: Map<string, HydrationJob>;
	readonly queue: HydrationJob[];
	readonly physicalTasks: Set<Promise<void>>;
	activeCount: number;
	closed: boolean;
	closePromise: Promise<void> | undefined;
};

function requirePositiveSafeInteger({
	name,
	value,
}: {
	name: string;
	value: number;
}): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: `${name} must be a positive safe integer`,
		});
	}
	return value;
}

function defaultClock(): ReplayHydrationClock {
	return {
		now: () => performance.now(),
		setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimeout: (timer) =>
			clearTimeout(timer as ReturnType<typeof setTimeout>),
	};
}

function resolveLimits({
	config,
}: {
	config: ReplayHydrationConfig;
}): ReplayHydrationLimits {
	return {
		maxActive: requirePositiveSafeInteger({
			name: "maxActive",
			value: config.maxActive ?? DEFAULT_MAX_ACTIVE,
		}),
		maxQueued: requirePositiveSafeInteger({
			name: "maxQueued",
			value: config.maxQueued ?? DEFAULT_MAX_QUEUED,
		}),
		deadlineMs: requirePositiveSafeInteger({
			name: "deadlineMs",
			value: config.deadlineMs ?? DEFAULT_DEADLINE_MS,
		}),
	};
}

export function createReplayHydrationScope({
	source,
	client,
	config,
	clock,
}: {
	source: ReplayHydrationSource;
	client: ReplayHydrationWorkerClient;
	config: ReplayHydrationConfig;
	clock?: ReplayHydrationClock;
}): ReplayHydrationScope {
	return {
		source,
		client,
		clock: clock ?? defaultClock(),
		limits: resolveLimits({ config }),
		currentJobs: new Map(),
		queue: [],
		physicalTasks: new Set(),
		activeCount: 0,
		closed: false,
		closePromise: undefined,
	};
}

export function assertScopeOpen({
	scope,
}: {
	scope: ReplayHydrationScope;
}): void {
	if (scope.closed) throw new ReplayHydrationClosedError();
}
