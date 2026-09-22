import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { CommitterDb } from "../../types/committerDb.js";

/** Knobs an operator can move while the worker runs; null leaves the boot value in place. */
export type CommitterControl = { concurrency: number | null };

export type CommitterContext = {
	db: CommitterDb;
	logger?: {
		info(message: string): void;
		warn(message: string): void;
		error(message: string): void;
	};
	/** Backoff between retries, cut short by `signal` when the committer stops; tests stand it in. */
	sleep?: (params: { delayMs: number; signal: AbortSignal }) => Promise<void>;
	/** Read on every flush start; absent means the boot config is the only source. */
	control?: { read(): CommitterControl };
};

/** A transient failure is retried until the store answers or the committer stops; the record is never given up on. */
export type FlushRetryPolicy = {
	/** Consecutive transient failures before the committer reports itself degraded, and again every so many after. */
	degradedAfterAttempts: number;
	initialBackoffMs: number;
	maxBackoffMs: number;
};

export type CommitterConfig = {
	/** Flushes in flight at once, and the ceiling any live control is clamped to: one per pool connection. */
	concurrency: number;
	/** Row changes one flush may carry; a hot partition cannot crowd out the others. */
	maxRowsPerFlush: number;
	retry: FlushRetryPolicy;
};

export type PartitionPosition = { topic: string; partition: number };

/** A record Postgres refused for a business reason: skipped, its changes never applied, the bookmark moved past it. */
export type FlushRejection = { record: DurableMutationRecord; cause: Error };

/** Where a call's records stopped landing. Without `failure`, every record before `nextOffset` is settled: landed, or rejected. */
export type FlushOutcome = {
	nextOffset: bigint;
	/** Moved only when a record in the call came from the command topic. */
	commandNextOffset?: bigint;
	failure?: { record: DurableMutationRecord; cause: unknown };
	rejections?: FlushRejection[];
};

/** One partition writer's batch, waiting for the flush that will carry it. */
export type FlushCall = PartitionPosition & {
	expectedOffset: bigint;
	commandNextOffset?: bigint;
	records: readonly DurableMutationRecord[];
	rows: number;
	settle: ReturnType<typeof Promise.withResolvers<FlushOutcome>>;
};

/** The calls one transaction carries. */
export type Flush = { calls: FlushCall[] };

export type CommitterState = {
	queue: FlushCall[];
	inFlight: number;
	/** Set while a flush has been waiting on the store past the degraded threshold. */
	degraded: boolean;
	stop: AbortController;
};

export type CommitterScope = {
	ctx: CommitterContext;
	config: CommitterConfig;
	state: CommitterState;
};

/** Lands committed log records in Postgres: every partition's ready batch, one transaction per flush. */
export type Committer = {
	apply(
		params: PartitionPosition & {
			expectedOffset: bigint;
			commandNextOffset?: bigint;
			records: readonly DurableMutationRecord[];
		},
	): Promise<FlushOutcome>;
	/** Resolves once nothing is queued or in flight. */
	drain(): Promise<void>;
	/** Ends every wait on the store: in-flight retries and queued calls reject; nothing is skipped. */
	stop(): void;
};

/** The postgres backend's StateStore; the writer's map answers reads, this only commits and bookmarks. */
export type CommitterStateStore = StateStore & {
	/** Fills the progress mirror from Postgres; must run before bootstrap reads `readNextOffset`. */
	loadProgress(params: PartitionPosition): Promise<void>;
};
