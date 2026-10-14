import { z } from "zod/v4";
import { BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY } from "../../keys.js";

export const SubjectSnapshotsEdgeConfigSchema = z
	.object({
		mode: z.enum(["off", "write", "verify", "serve"]).default("off"),
		maxBytes: z.number().int().positive().default(262_144),
		dropBatch: z.number().int().positive().max(5_000).default(500),
		refreshConcurrency: z.number().int().positive().max(1_000).default(50),
		refreshMaxPending: z.number().int().positive().default(10_000),
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

export const writesSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode !== "off";

export const readsSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode === "verify" || mode === "serve";

export const servesSubjectSnapshots = ({
	mode,
}: {
	mode: SubjectSnapshotMode;
}): boolean => mode === "serve";

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
