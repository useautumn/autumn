export type PrimaryHydrationHedgeEvent =
	| "started"
	| "primary_won"
	| "hedge_won"
	| "skipped_capacity"
	| "both_failed";

type ReadOutcome<T> =
	| { source: "primary" | "hedge"; status: "fulfilled"; value: T }
	| { source: "primary" | "hedge"; status: "rejected"; reason: unknown };

let activePrimaryHydrationHedges = 0;

const settleRead = <T>({
	source,
	run,
}: {
	source: "primary" | "hedge";
	run: () => Promise<T>;
}): Promise<ReadOutcome<T>> =>
	Promise.resolve()
		.then(run)
		.then(
			(value) => ({ source, status: "fulfilled", value }),
			(reason: unknown) => ({ source, status: "rejected", reason }),
		);

const tryAcquireHedge = ({
	maxInFlightHedges,
}: {
	maxInFlightHedges: number;
}): (() => void) | null => {
	if (
		maxInFlightHedges <= 0 ||
		activePrimaryHydrationHedges >= maxInFlightHedges
	) {
		return null;
	}

	activePrimaryHydrationHedges++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		activePrimaryHydrationHedges = Math.max(
			0,
			activePrimaryHydrationHedges - 1,
		);
	};
};

const unwrapOutcome = <T>(outcome: ReadOutcome<T>): T => {
	if (outcome.status === "fulfilled") return outcome.value;
	throw outcome.reason;
};

/** Starts one capped, delayed duplicate; the first successful read wins.
 * Losing queries retain their hedge slot until they settle because they cannot be cancelled safely. */
export const runPrimaryHydrationWithHedge = async <T>({
	primaryFn,
	hedgeFn,
	hedgeAfterMs,
	maxInFlightHedges,
	shouldHedgeOnError = () => true,
	onEvent,
}: {
	primaryFn: () => Promise<T>;
	hedgeFn: () => Promise<T>;
	hedgeAfterMs: number;
	maxInFlightHedges: number;
	shouldHedgeOnError?: (error: unknown) => boolean;
	onEvent?: (event: PrimaryHydrationHedgeEvent) => void;
}): Promise<T> => {
	const emit = (event: PrimaryHydrationHedgeEvent) => {
		try {
			onEvent?.(event);
		} catch {
			// Observability must never alter the read outcome.
		}
	};

	const primaryOutcomePromise = settleRead({
		source: "primary",
		run: primaryFn,
	});
	const delayElapsed = Symbol("primary hydration hedge delay elapsed");
	let delayTimer: ReturnType<typeof setTimeout> | undefined;
	const delayPromise = new Promise<typeof delayElapsed>((resolve) => {
		delayTimer = setTimeout(() => resolve(delayElapsed), hedgeAfterMs);
		delayTimer.unref?.();
	});

	const initialOutcome = await Promise.race([
		primaryOutcomePromise,
		delayPromise,
	]);
	clearTimeout(delayTimer);

	if (initialOutcome !== delayElapsed) {
		if (initialOutcome.status === "fulfilled") return initialOutcome.value;
		if (!shouldHedgeOnError(initialOutcome.reason)) {
			throw initialOutcome.reason;
		}
	}

	const releaseHedge = tryAcquireHedge({ maxInFlightHedges });
	if (!releaseHedge) {
		emit("skipped_capacity");
		return unwrapOutcome(await primaryOutcomePromise);
	}

	emit("started");
	const hedgeOutcomePromise = settleRead({
		source: "hedge",
		run: hedgeFn,
	}).finally(releaseHedge);
	const firstOutcome = await Promise.race([
		primaryOutcomePromise,
		hedgeOutcomePromise,
	]);

	if (firstOutcome.status === "fulfilled") {
		emit(firstOutcome.source === "primary" ? "primary_won" : "hedge_won");
		return firstOutcome.value;
	}

	const secondOutcome = await (firstOutcome.source === "primary"
		? hedgeOutcomePromise
		: primaryOutcomePromise);
	if (secondOutcome.status === "fulfilled") {
		emit(secondOutcome.source === "primary" ? "primary_won" : "hedge_won");
		return secondOutcome.value;
	}

	emit("both_failed");
	const primaryOutcome =
		firstOutcome.source === "primary" ? firstOutcome : secondOutcome;
	throw primaryOutcome.reason;
};

export const _getActivePrimaryHydrationHedgesForTesting = (): number =>
	activePrimaryHydrationHedges;

export const _resetPrimaryHydrationHedgeForTesting = (): void => {
	activePrimaryHydrationHedges = 0;
};
