import { z } from "zod/v4";

/** What the worker does with `subject_snapshots`; written by hand in S3, read at every decision that touches the table. */
export const BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY =
	"admin/balance-worker-subject-snapshots.json";

/** verify and serve need the read path; until it ships they are not modes, and an object naming one is refused whole. */
export const SubjectSnapshotsEdgeConfigSchema = z
	.object({
		/** off writes nothing; write keeps the table from the committer's flushes and the evicts' deletes. */
		mode: z.enum(["off", "write"]).default("off"),
		/** A serialized state larger than this is never written: its customer's rows are deleted on its next flush. */
		maxBytes: z.number().int().positive().default(262_144),
		/** Customers one evict DELETE carries; a storm of evicts lands as this many per statement. */
		dropBatch: z.number().int().positive().max(5_000).default(500),
	})
	.strict();

export type SubjectSnapshotsEdgeConfig = z.infer<
	typeof SubjectSnapshotsEdgeConfigSchema
>;
export type SubjectSnapshotMode = SubjectSnapshotsEdgeConfig["mode"];

/** Whoever decides about the table reads this, never a boot-time copy: a flip in S3 takes effect at the next flush and the next evict. */
export type SubjectSnapshotControl = { read(): SubjectSnapshotsEdgeConfig };

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
