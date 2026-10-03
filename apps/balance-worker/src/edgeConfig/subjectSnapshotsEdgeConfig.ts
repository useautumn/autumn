import { z } from "zod/v4";

/** What the worker does with `subject_snapshots`; written by hand in S3, read at every decision that touches the table. */
export const BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY =
	"admin/balance-worker-subject-snapshots.json";

/** verify needs both reads side by side; until it ships it is not a mode, and an object naming it is refused whole. */
export const SubjectSnapshotsEdgeConfigSchema = z
	.object({
		/** off writes nothing; write keeps the table from the committer's flushes and the evicts' deletes; serve also loads from it. */
		mode: z.enum(["off", "write", "serve"]).default("off"),
		/** A state weighing more than this is never written: the writer deletes its customer's rows instead. */
		maxBytes: z.number().int().positive().default(262_144),
		/** Customers one evict DELETE carries; a storm of evicts lands as this many per statement. */
		dropBatch: z.number().int().positive().max(5_000).default(500),
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

export const servesSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode === "serve";
