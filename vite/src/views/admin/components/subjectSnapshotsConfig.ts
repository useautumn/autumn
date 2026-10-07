import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotMode,
	type SubjectSnapshotsEdgeConfig,
	SubjectSnapshotsEdgeConfigSchema,
} from "@autumn/edge-config/subjectSnapshots";
import { formatDistanceToNow } from "date-fns";

export type SubjectSnapshotsConfigResponse = SubjectSnapshotsEdgeConfig & {
	configHealthy: boolean;
	error: string | null;
};

export type SubjectSnapshotsLimit = Exclude<
	keyof SubjectSnapshotsEdgeConfig,
	"mode" | "writtenAfter"
>;

export type SubjectSnapshotsFormValues = {
	mode: SubjectSnapshotMode;
} & Record<SubjectSnapshotsLimit, number | null>;

export type SubjectSnapshotsChange = {
	field: keyof SubjectSnapshotsEdgeConfig;
	label: string;
	from: string;
	to: string;
};

export const SUBJECT_SNAPSHOTS_ENDPOINT = "/admin/subject-snapshots-config";
export const SUBJECT_SNAPSHOTS_QUERY_KEY = [
	"admin-edge-config",
	"subject-snapshots",
] as const;

export const SUBJECT_SNAPSHOT_DEFAULTS = defaultSubjectSnapshotsEdgeConfig();

export const SUBJECT_SNAPSHOT_MODES: {
	value: SubjectSnapshotMode;
	label: string;
	description: string;
}[] = [
	{
		value: "off",
		label: "Off",
		description: "The worker ignores the table: nothing is written or read.",
	},
	{
		value: "write",
		label: "Write",
		description:
			"The worker keeps the table up to date, but cold loads still read the balance rows.",
	},
	{
		value: "verify",
		label: "Verify",
		description:
			"Cold loads also read the snapshot and log any mismatch with the rows, but still serve the rows.",
	},
	{
		value: "serve",
		label: "Serve",
		description:
			"Cold loads read the snapshot instead of the rows, so customers see balances built from the table.",
	},
];

export const SUBJECT_SNAPSHOT_LIMITS: {
	name: SubjectSnapshotsLimit;
	label: string;
	description: string;
	max?: number;
}[] = [
	{
		name: "maxBytes",
		label: "Max snapshot size (bytes)",
		description:
			"A customer state bigger than this is never written; its row is deleted instead.",
	},
	{
		name: "dropBatch",
		label: "Evict batch size",
		description: "Customers one evict DELETE carries.",
		max: 5_000,
	},
	{
		name: "refreshConcurrency",
		label: "Refresh concurrency",
		description: "Snapshots an evict rebuilds at once, per partition.",
		max: 1_000,
	},
	{
		name: "refreshMaxPending",
		label: "Refresh queue limit",
		description:
			"Past this many waiting rebuilds, a partition drops new ones; they miss once on their next cold load.",
	},
];

const modeLabel = (mode: SubjectSnapshotMode) =>
	SUBJECT_SNAPSHOT_MODES.find((option) => option.value === mode)?.label ?? mode;

export const formatWrittenAfter = (writtenAfter: number) =>
	writtenAfter === 0
		? "Not set, every row counts"
		: `${new Date(writtenAfter).toLocaleString()} (${formatDistanceToNow(writtenAfter, { addSuffix: true })})`;

export const toSubjectSnapshotsFormValues = (
	config: SubjectSnapshotsEdgeConfig,
): SubjectSnapshotsFormValues => ({
	mode: config.mode,
	maxBytes: config.maxBytes,
	dropBatch: config.dropBatch,
	refreshConcurrency: config.refreshConcurrency,
	refreshMaxPending: config.refreshMaxPending,
});

/** A cleared limit falls back to its default; writtenAfter is carried, never typed. */
export const toSubjectSnapshotsConfig = ({
	values,
	writtenAfter,
}: {
	values: SubjectSnapshotsFormValues;
	writtenAfter: number;
}): SubjectSnapshotsEdgeConfig =>
	SubjectSnapshotsEdgeConfigSchema.parse({
		mode: values.mode,
		maxBytes: values.maxBytes ?? undefined,
		dropBatch: values.dropBatch ?? undefined,
		refreshConcurrency: values.refreshConcurrency ?? undefined,
		refreshMaxPending: values.refreshMaxPending ?? undefined,
		writtenAfter,
	});

export const subjectSnapshotsChanges = ({
	current,
	next,
}: {
	current: SubjectSnapshotsEdgeConfig;
	next: SubjectSnapshotsEdgeConfig;
}): SubjectSnapshotsChange[] => {
	const changes: SubjectSnapshotsChange[] = [];
	if (current.mode !== next.mode) {
		changes.push({
			field: "mode",
			label: "Mode",
			from: modeLabel(current.mode),
			to: modeLabel(next.mode),
		});
	}
	for (const limit of SUBJECT_SNAPSHOT_LIMITS) {
		if (current[limit.name] === next[limit.name]) continue;
		changes.push({
			field: limit.name,
			label: limit.label,
			from: current[limit.name].toLocaleString(),
			to: next[limit.name].toLocaleString(),
		});
	}
	if (current.writtenAfter !== next.writtenAfter) {
		changes.push({
			field: "writtenAfter",
			label: "Only trust rows written after",
			from: formatWrittenAfter(current.writtenAfter),
			to: formatWrittenAfter(next.writtenAfter),
		});
	}
	return changes;
};
