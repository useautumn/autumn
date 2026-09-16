import type { InitializationDecision } from "@autumn/balance-engine";
import type {
	BalanceHydrationClock,
	BalanceHydrationConfig,
	BalanceHydrationSource,
	BalanceHydrationWorkerClient,
} from "../balanceHydrationContracts.js";
import {
	BalanceHydrationClosedError,
	BalanceHydrationInvalidSelectionError,
} from "../balanceHydrationErrors.js";
import type { NormalizedSelection } from "./balanceHydrationSelection.js";

const DEFAULT_MAX_ACTIVE = 4;
const DEFAULT_MAX_QUEUED = 64;
const DEFAULT_DEADLINE_MS = 5_000;

export type JobSettlement = {
	promise: Promise<InitializationDecision>;
	resolve: (decision: InitializationDecision) => void;
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

export type BalanceHydrationLimits = Readonly<{
	maxActive: number;
	maxQueued: number;
	deadlineMs: number;
}>;

export type BalanceHydrationScope = {
	readonly source: BalanceHydrationSource;
	readonly client: BalanceHydrationWorkerClient;
	readonly clock: BalanceHydrationClock;
	readonly limits: BalanceHydrationLimits;
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
		throw new BalanceHydrationInvalidSelectionError({
			reason: `${name} must be a positive safe integer`,
		});
	}
	return value;
}

function defaultClock(): BalanceHydrationClock {
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
	config: BalanceHydrationConfig;
}): BalanceHydrationLimits {
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

export function createBalanceHydrationScope({
	source,
	client,
	config,
	clock,
}: {
	source: BalanceHydrationSource;
	client: BalanceHydrationWorkerClient;
	config: BalanceHydrationConfig;
	clock?: BalanceHydrationClock;
}): BalanceHydrationScope {
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
	scope: BalanceHydrationScope;
}): void {
	if (scope.closed) throw new BalanceHydrationClosedError();
}
