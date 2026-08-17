export type DelayedPostgresBackupReadEvent =
	| "started"
	| "primary_won"
	| "backup_won"
	| "skipped_capacity"
	| "both_failed";

type ReadOutcome<T> =
	| { source: "primary" | "backup"; status: "fulfilled"; value: T }
	| { source: "primary" | "backup"; status: "rejected"; reason: unknown };

let activeDelayedPostgresBackupReads = 0;

const settleRead = <T>({
	source,
	run,
}: {
	source: "primary" | "backup";
	run: () => Promise<T>;
}): Promise<ReadOutcome<T>> =>
	Promise.resolve()
		.then(run)
		.then(
			(value) => ({ source, status: "fulfilled", value }),
			(reason: unknown) => ({ source, status: "rejected", reason }),
		);

const tryAcquireBackup = ({
	maxInFlightBackups,
}: {
	maxInFlightBackups: number;
}): (() => void) | null => {
	if (
		maxInFlightBackups <= 0 ||
		activeDelayedPostgresBackupReads >= maxInFlightBackups
	) {
		return null;
	}

	activeDelayedPostgresBackupReads++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		activeDelayedPostgresBackupReads = Math.max(
			0,
			activeDelayedPostgresBackupReads - 1,
		);
	};
};

const unwrapOutcome = <T>(outcome: ReadOutcome<T>): T => {
	if (outcome.status === "fulfilled") return outcome.value;
	throw outcome.reason;
};

/** Starts one capped, delayed backup; the first successful read wins.
 * Losing queries retain their slot until they settle because they cannot be cancelled safely. */
export const runWithDelayedPostgresBackupRead = async <T>({
	primaryFn,
	backupFn,
	delayMs,
	maxInFlightBackups,
	shouldStartBackupOnError = () => true,
	onEvent,
}: {
	primaryFn: () => Promise<T>;
	backupFn: () => Promise<T>;
	delayMs: number;
	maxInFlightBackups: number;
	shouldStartBackupOnError?: (error: unknown) => boolean;
	onEvent?: (event: DelayedPostgresBackupReadEvent) => void;
}): Promise<T> => {
	const emit = (event: DelayedPostgresBackupReadEvent) => {
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
	const delayElapsed = Symbol("delayed Postgres backup read delay elapsed");
	let delayTimer: ReturnType<typeof setTimeout> | undefined;
	const delayPromise = new Promise<typeof delayElapsed>((resolve) => {
		delayTimer = setTimeout(() => resolve(delayElapsed), delayMs);
		delayTimer.unref?.();
	});

	const initialOutcome = await Promise.race([
		primaryOutcomePromise,
		delayPromise,
	]);
	clearTimeout(delayTimer);

	if (initialOutcome !== delayElapsed) {
		if (initialOutcome.status === "fulfilled") return initialOutcome.value;
		if (!shouldStartBackupOnError(initialOutcome.reason)) {
			throw initialOutcome.reason;
		}
	}

	const releaseBackup = tryAcquireBackup({ maxInFlightBackups });
	if (!releaseBackup) {
		emit("skipped_capacity");
		return unwrapOutcome(await primaryOutcomePromise);
	}

	emit("started");
	const backupOutcomePromise = settleRead({
		source: "backup",
		run: backupFn,
	}).finally(releaseBackup);
	const firstOutcome = await Promise.race([
		primaryOutcomePromise,
		backupOutcomePromise,
	]);

	if (firstOutcome.status === "fulfilled") {
		emit(firstOutcome.source === "primary" ? "primary_won" : "backup_won");
		return firstOutcome.value;
	}

	const secondOutcome = await (firstOutcome.source === "primary"
		? backupOutcomePromise
		: primaryOutcomePromise);
	if (secondOutcome.status === "fulfilled") {
		emit(secondOutcome.source === "primary" ? "primary_won" : "backup_won");
		return secondOutcome.value;
	}

	emit("both_failed");
	const primaryOutcome =
		firstOutcome.source === "primary" ? firstOutcome : secondOutcome;
	throw primaryOutcome.reason;
};

export const _getActiveDelayedPostgresBackupReadsForTesting = (): number =>
	activeDelayedPostgresBackupReads;

export const _resetDelayedPostgresBackupReadsForTesting = (): void => {
	activeDelayedPostgresBackupReads = 0;
};
