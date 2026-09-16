import type { ReplayArchiveClock } from "./replayArchiveContracts.js";

export type ReplayStartOutcome<T> =
	| Readonly<{ kind: "started"; value: T }>
	| Readonly<{ kind: "cancelled" }>;

export type ReplayStartPacer = {
	start<T>(params: {
		invoke: () => Promise<T>;
	}): Promise<ReplayStartOutcome<T>>;
};

/** The slot wraps the in-flight request so the permission tail resolves as soon
 *  as the call is launched instead of when it answers. */
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

/** Waits out the remainder of the interval since the last actual start. */
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

/** Holds the permit until the request is launched, then hands back the
 *  in-flight promise so the tail can release the next permit. */
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
	// Swallowed solely so a rejected request still frees the queue; the
	// rejection stays visible on the returned promise.
	context.state.tail = launched.then(ignore, ignore);
	return launched.then(unwrapSlot);
}

/** A single FIFO tail serializes permission to start across every lane: the
 *  holder waits out the interval since the last actual start, launches its
 *  request and only then releases the next permit, so delays never let a batch
 *  of requests bunch up. */
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
