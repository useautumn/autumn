import { z } from "zod/v4";
import { BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY } from "../../keys.js";

/** An object naming an unknown mode or key is refused whole, and the last good record stays. */
export const SubjectSnapshotsEdgeConfigSchema = z
	.object({
		/**
		 * off writes nothing; write keeps the table from the committer's flushes and the evicts' deletes; verify also reads
		 * it beside the rows on a cold load for now and logs where they disagree, serving the rows; serve loads from it.
		 */
		mode: z.enum(["off", "write", "verify", "serve"]).default("off"),
		/** A state weighing more than this is never written: the writer deletes its customer's rows instead. */
		maxBytes: z.number().int().positive().default(262_144),
		/** Customers one evict DELETE carries; a storm of evicts lands as this many per statement. */
		dropBatch: z.number().int().positive().max(5_000).default(500),
		/** Rows an evict rebuilds at once per partition; the worker's subject-load gate still bounds what reaches Postgres. */
		refreshConcurrency: z.number().int().positive().max(1_000).default(50),
		/** Past this many subjects waiting to be rebuilt, a partition drops further ones: they miss once on their next cold load. */
		refreshMaxPending: z.number().int().positive().default(10_000),
		/** Rows written at or before this (ms) are invisible to serve and verify: set it to now in the edit that turns off back to write. */
		writtenAfter: z.number().int().nonnegative().default(0),
	})
	.strict();

export type SubjectSnapshotsEdgeConfig = z.infer<
	typeof SubjectSnapshotsEdgeConfigSchema
>;
export type SubjectSnapshotMode = SubjectSnapshotsEdgeConfig["mode"];

export const defaultSubjectSnapshotsEdgeConfig =
	(): SubjectSnapshotsEdgeConfig => ({
		mode: "off",
		maxBytes: 262_144,
		dropBatch: 500,
		refreshConcurrency: 50,
		refreshMaxPending: 10_000,
		writtenAfter: 0,
	});

export const subjectSnapshotsEdgeConfig = {
	key: BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	schema: SubjectSnapshotsEdgeConfigSchema,
	defaultValue: defaultSubjectSnapshotsEdgeConfig,
} as const;

/** Every mode past off keeps the table: a mode that reads it must also keep it true. */
export const writesSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode !== "off";

/** A cold load asks the statement for the row: to serve it, or to check it against the rows. */
export const readsSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode === "verify" || mode === "serve";

/** The row answers in place of the rows. */
export const servesSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode === "serve";

/** Leaving off stamps writtenAfter, so rows left from an earlier run never reach verify or serve. */
export const stampSubjectSnapshotsWrittenAfter = ({
	previous,
	next,
	now,
}: {
	previous: SubjectSnapshotsEdgeConfig | null;
	next: SubjectSnapshotsEdgeConfig;
	now: number;
}): SubjectSnapshotsEdgeConfig => {
	const leavesOff =
		(previous?.mode ?? "off") === "off" &&
		writesSubjectSnapshots({ mode: next.mode });
	return leavesOff ? { ...next, writtenAfter: now } : next;
};
