import type { ReplayArchiveClock } from "./replayArchiveContracts.js";

export type ReplayStartOutcome<T> =
	| Readonly<{ kind: "started"; value: T }>
	| Readonly<{ kind: "cancelled" }>;

export type ReplayStartPacer = {
	start<T>(params: {
		invoke: () => Promise<T>;
	}): Promise<ReplayStartOutcome<T>>;
};

type ReplayStartSlot<T> = Readonly<{ pending: Promise<ReplayStartOutcome<T>> }>;

const CANCELLED: Readonly<{ kind: "cancelled" }> = Object.freeze({
	kind: "cancelled",
});

const toStarted = <T>(value: T): ReplayStartOutcome<T> => ({
	kind: "started",
	value,
});

const ignore = () => undefined;

const unwrapSlot = <T>(
	slot: ReplayStartSlot<T>,
): Promise<ReplayStartOutcome<T>> => slot.pending;

type ReplayStartPacerState = {
	tail: Promise<void>;
	lastStartMs: number | null;
};

type ReplayStartPacerContext = Readonly<{
	state: ReplayStartPacerState;
	intervalMs: number;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
}>;

const cancelledSlot = <T>(): ReplayStartSlot<T> => ({
	pending: Promise.resolve<ReplayStartOutcome<T>>(CANCELLED),
});

async function waitForSlot({
	context,
}: {
	context: ReplayStartPacerContext;
}): Promise<void> {
	const { state, intervalMs, clock, signal } = context;
	if (state.lastStartMs === null) return;
	const delayMs = state.lastStartMs + intervalMs - clock.now();
	if (delayMs <= 0) return;
	await clock.sleep({ durationMs: delayMs, signal });
}

async function launchWithPermit<T>({
	context,
	invoke,
}: {
	context: ReplayStartPacerContext;
	invoke: () => Promise<T>;
}): Promise<ReplayStartSlot<T>> {
	const { state, clock, signal } = context;
	if (signal.aborted) return cancelledSlot<T>();
	await waitForSlot({ context });
	if (signal.aborted) return cancelledSlot<T>();
	state.lastStartMs = clock.now();
	return { pending: invoke().then(toStarted) };
}

function scheduleStart<T>({
	context,
	invoke,
}: {
	context: ReplayStartPacerContext;
	invoke: () => Promise<T>;
}): Promise<ReplayStartOutcome<T>> {
	const launched = context.state.tail.then(() =>
		launchWithPermit({ context, invoke }),
	);
	context.state.tail = launched.then(ignore, ignore);
	return launched.then(unwrapSlot);
}

export function createReplayStartPacer({
	intervalMs,
	clock,
	signal,
}: {
	intervalMs: number;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
}): ReplayStartPacer {
	const context: ReplayStartPacerContext = {
		state: { tail: Promise.resolve(), lastStartMs: null },
		intervalMs,
		clock,
		signal,
	};

	return {
		start: <T>({ invoke }: { invoke: () => Promise<T> }) =>
			scheduleStart({ context, invoke }),
	};
}
