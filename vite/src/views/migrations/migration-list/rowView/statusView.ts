import type {
	MigrationListActivityKind,
	MigrationListItemCounts,
	MigrationListSummary,
	MigrationRunErrorCode,
	MigrationRunStatus,
	MigrationStatus,
} from "@autumn/shared";
import type { StatusTone } from "@autumn/ui";
import { format, formatDistanceStrict } from "date-fns";
import { STATUS_INDICATORS } from "../../migration/shared/migrationStatus";
import type { ChipView } from "./chipView";

type SegmentKind =
	| "migrated"
	| "up_to_date"
	| "skipped"
	| "failed"
	| "in_flight"
	| "not_reached"
	| "would_change"
	| "would_fail"
	| "sampled";

export const SEGMENTS: Record<
	SegmentKind,
	{ className: string; label: string }
> = {
	migrated: { className: "bg-[#30A46C]", label: "Migrated" },
	up_to_date: {
		className: "bg-[#c4c4c4] dark:bg-[#5a5a5a]",
		label: "Already up to date",
	},
	skipped: { className: "bg-[#E5A21F]", label: "Skipped" },
	failed: { className: "bg-[#E5484D]", label: "Failed" },
	in_flight: { className: "bg-[#30A46C]/45", label: "In progress" },
	not_reached: {
		className: "bg-black/[0.07] dark:bg-[#262626]",
		label: "Not reached",
	},
	would_change: { className: "bg-[#3E8BD9]/55", label: "Would change" },
	would_fail: { className: "bg-[#E8742C]/70", label: "Would fail" },
	sampled: { className: "bg-[#30A46C]", label: "Migrated in sample" },
};

type Segment = { kind: SegmentKind; value: number };

export type RunErrorView = { message: string; details: string | null };

export type StatusView = {
	ring: { tone: StatusTone; fraction: number };
	chip: ChipView;
	card: {
		chip: ChipView;
		when: string;
		note: string | null;
		error: RunErrorView | null;
		legend: Segment[];
	};
};

type RunProgress = {
	counts: MigrationListItemCounts;
	fraction: number;
	percent: string;
	segments: Segment[];
};

const EMPTY_COUNTS: MigrationListItemCounts = {
	total: 0,
	running: 0,
	succeeded: 0,
	no_updates_needed: 0,
	ineligible: 0,
	failed: 0,
};

const FINISHED_RUN_STATUSES: MigrationStatus[] = ["run", "no_changes"];

/** Claims land page by page, so an unfinished run measures against the filter
 * count; a finished run claimed every match, so it measures against its claims. */
const runProgress = ({
	summary,
	isFinished,
}: {
	summary: MigrationListSummary;
	isFinished: boolean;
}): RunProgress => {
	const counts = summary.latest_run?.counts ?? EMPTY_COUNTS;
	const completed =
		counts.succeeded +
		counts.no_updates_needed +
		counts.ineligible +
		counts.failed;
	const denominator = isFinished
		? counts.total
		: Math.max(counts.total, summary.customer_count ?? 0);
	const fraction = denominator > 0 ? Math.min(completed / denominator, 1) : 0;
	return {
		counts,
		fraction,
		percent: `${Math.round(fraction * 100)}%`,
		segments: [
			{ kind: "migrated", value: counts.succeeded },
			{ kind: "up_to_date", value: counts.no_updates_needed },
			{ kind: "skipped", value: counts.ineligible },
			{ kind: "failed", value: counts.failed },
			{ kind: "in_flight", value: counts.running },
			{
				kind: "not_reached",
				value: Math.max(denominator - completed - counts.running, 0),
			},
		],
	};
};

const draftSegments = (summary: MigrationListSummary): Segment[] => {
	const { latest_dry_run: dryRun, latest_sample: sample } = summary;
	if (dryRun)
		return [
			{ kind: "would_change", value: dryRun.would_change },
			{ kind: "would_fail", value: dryRun.would_fail },
		];
	if (sample) return [{ kind: "sampled", value: sample.size }];
	return [];
};

const PREVIEW_OUTCOMES: Record<MigrationRunStatus, string> = {
	queued: " running",
	running: " running",
	succeeded: "",
	no_changes: "",
	failed: " failed",
	canceled: " canceled",
};

const previewOutcome = (summary: MigrationListSummary): string | undefined => {
	const { latest_dry_run: dryRun, latest_sample: sample } = summary;
	if (dryRun) return `· dry run${PREVIEW_OUTCOMES[dryRun.status]}`;
	if (sample) return `· sample${PREVIEW_OUTCOMES[sample.status]}`;
	return undefined;
};

/** `tone` overrides the status indicator tone; `cardDetail` shows only in the hover card. */
type Pill = {
	label: string;
	detail?: string;
	cardDetail?: string;
	fraction: number;
	tone?: StatusTone;
};

const PILLS: Record<
	MigrationStatus,
	(input: { summary: MigrationListSummary; progress: RunProgress }) => Pill
> = {
	draft: ({ summary }) => ({
		label: "Draft",
		cardDetail: previewOutcome(summary),
		fraction: 0,
	}),
	waiting: ({ summary }) => ({
		label: "Waiting",
		detail:
			summary.queue_position === null
				? undefined
				: `· ${summary.queue_position} ahead`,
		fraction: 0,
	}),
	running: ({ progress }) => ({
		label: "Running",
		detail: progress.percent,
		fraction: progress.fraction,
	}),
	run: ({ progress }) => {
		const { failed } = progress.counts;
		return {
			label: "Completed",
			detail:
				failed > 0 ? `· ${failed.toLocaleString("en-US")} failed` : undefined,
			fraction: 1,
			tone: failed > 0 ? "amber" : "green",
		};
	},
	no_changes: () => ({ label: "No changes", fraction: 1 }),
	failed: ({ progress }) => ({
		label: "Failed",
		detail: `at ${progress.percent}`,
		fraction: progress.fraction,
	}),
	canceled: ({ progress }) => ({
		label: "Canceled",
		detail: `at ${progress.percent}`,
		fraction: progress.fraction,
	}),
};

const RUN_ERROR_MESSAGES: Record<MigrationRunErrorCode, string> = {
	cache_invalidation_incomplete:
		"The run stopped before it could confirm every update. Changes already applied are kept, and unconfirmed customers are marked failed so you can retry them.",
	stripe_error:
		"Stripe returned an error, so the run stopped. Customers already migrated keep their changes.",
	timed_out:
		"The run took too long and stopped. Customers already migrated keep their changes.",
	canceled:
		"The run was canceled before it finished. Customers already migrated keep their changes.",
	interrupted:
		"The run was interrupted before it finished. Customers already migrated keep their changes.",
	dispatch_failed: "The run couldn't be started. Try running it again.",
	page_limit_exceeded:
		"The run matched more customers than one run can process. Narrow the filter and run it again.",
	unknown:
		"The run stopped unexpectedly. Customers already migrated keep their changes.",
};

/** Codes newer than this dashboard fall back to the generic sentence. */
const describeRunError = (
	summary: MigrationListSummary,
): RunErrorView | null => {
	const run = summary.latest_run;
	if (!run?.error_code && !run?.error_message) return null;
	return {
		message:
			RUN_ERROR_MESSAGES[run.error_code ?? "unknown"] ??
			RUN_ERROR_MESSAGES.unknown,
		details: run.error_message,
	};
};

/** Terminal outcomes already read from the status chip, so they carry no verb. */
const ACTIVITY_VERBS: Record<MigrationListActivityKind, string | null> = {
	created: "Created",
	edited: "Edited",
	queued: "Queued",
	started: "Started",
	finished: null,
	failed: null,
	canceled: null,
	dry_run: "Dry run",
	sample: "Sample",
};

const describeWhen = ({
	summary,
	now,
}: {
	summary: MigrationListSummary;
	now: number;
}): string => {
	const { kind, at } = summary.last_activity;
	const verb = ACTIVITY_VERBS[kind];
	if (kind === "queued" || kind === "started")
		return `${verb} ${formatDistanceStrict(at, now)} ago`;
	const run = summary.latest_run;
	const ranFor =
		run?.started_at && run.finished_at === at
			? ` · after ${formatDistanceStrict(run.started_at, at)}`
			: "";
	const date = format(at, "MMM d, HH:mm");
	return `${verb ? `${verb} ${date}` : date}${ranFor}`;
};

/** Customers that started matching the filter after a finished run claimed its matches. */
const laterMatchesNote = (summary: MigrationListSummary): string | null => {
	const claimed = summary.latest_run?.counts.total ?? 0;
	const laterMatches = (summary.customer_count ?? 0) - claimed;
	if (laterMatches <= 0) return null;
	return `${laterMatches.toLocaleString("en-US")} more customers match the filter now than this run covered`;
};

export const deriveStatusView = ({
	status,
	summary,
	now,
}: {
	status: MigrationStatus;
	summary: MigrationListSummary;
	now: number;
}): StatusView => {
	const isFinished = FINISHED_RUN_STATUSES.includes(status);
	const progress = runProgress({ summary, isFinished });
	const indicator = STATUS_INDICATORS[status];
	const {
		label,
		detail,
		cardDetail,
		fraction,
		tone = indicator.tone,
	} = PILLS[status]({ summary, progress });
	const segments =
		status === "draft" ? draftSegments(summary) : progress.segments;
	const chipWith = (text: string | undefined): ChipView => ({
		label,
		details: text === undefined ? undefined : [text],
	});

	return {
		ring: { tone, fraction },
		chip: chipWith(detail),
		card: {
			chip: chipWith(cardDetail ?? detail),
			when: describeWhen({ summary, now }),
			note: isFinished ? laterMatchesNote(summary) : null,
			error: status === "failed" ? describeRunError(summary) : null,
			legend: segments.filter((segment) => segment.value > 0),
		},
	};
};
