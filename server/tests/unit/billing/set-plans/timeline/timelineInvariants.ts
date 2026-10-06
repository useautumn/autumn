import { expect } from "bun:test";
import { ms } from "@autumn/shared";
import { matchReviewPhases } from "@/internal/billing/v2/actions/setPlans/preview/review/matchReviewPhases";
import {
	type ReviewRows,
	timelineToReviewRows,
} from "@/internal/billing/v2/actions/setPlans/preview/review/timelineToReviewRows";
import type { ReviewPlanRow } from "@/internal/billing/v2/actions/setPlans/preview/review/types/reviewPhase";
import { diffTimelines } from "@/internal/billing/v2/actions/setPlans/timeline/diffTimelines/diffTimelines";
import { rowsToSavedTimeline } from "@/internal/billing/v2/actions/setPlans/timeline/savedTimeline/rowsToSavedTimeline";
import { isAliveAt } from "@/internal/billing/v2/actions/setPlans/timeline/timelineGuards";
import type { SetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/timeline/types/setPlansPolicies";
import type {
	DesiredTimeline,
	SavedTimeline,
} from "@/internal/billing/v2/actions/setPlans/timeline/types/timeline";
import type {
	ResolvedSegment,
	TimelineDiff,
	TimelineOperation,
} from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";
import type { TimelineRow } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineRow";
import { desiredSegment, NOW, plan } from "./timelineFixtures";

export type TimelineCase = {
	rows: TimelineRow[];
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
};

/** A request's phases start now and wherever one of its declared plans starts or ends. */
const requestPhaseStarts = (desired: DesiredTimeline) => [
	NOW,
	...[
		...new Set(
			desired.segments
				.flatMap(({ startsAt, endsAt }) => [startsAt, endsAt])
				.filter((at): at is number => at !== null && at > NOW),
		),
	].sort((first, second) => first - second),
];

export const runTimelineCase = ({ rows, desired, policies }: TimelineCase) => {
	const saved = rowsToSavedTimeline({ rows, now: NOW });
	const diff = diffTimelines({ saved, desired, policies, now: NOW });
	const matches = matchReviewPhases({
		saved,
		timeline: diff.timeline,
		phaseStarts: requestPhaseStarts(desired),
		now: NOW,
	});
	const review = timelineToReviewRows({ saved, diff, matches });
	return { saved, diff, review };
};

const segmentRow = (segment: ResolvedSegment): TimelineRow => ({
	customerProductId: `inserted:${segment.id}`,
	planId: segment.planId,
	internalEntityId: segment.internalEntityId,
	replacementKey: segment.replacementKey,
	configHash: segment.configHash,
	lifetime: segment.lifetime,
	onLiveSubscription: true,
	startsAt: segment.startsAt,
	endsAt: segment.endsAt,
	periodEndsAtAfterReset: null,
	scheduled: segment.startsAt > NOW,
	canceling: segment.inheritsCancellation === true,
	pastDue: false,
	unbilledByStripe: false,
	externalId: null,
});

/** The saved rows after the diff's row writes, the way execution would leave them. */
export const applyTimelineOperations = ({
	rows,
	diff,
}: {
	rows: TimelineRow[];
	diff: TimelineDiff;
}): TimelineRow[] => {
	const removedIds = new Set(
		diff.operations.flatMap((operation) =>
			operation.type === "expire" || operation.type === "delete"
				? [operation.customerProductId]
				: [],
		),
	);
	const retimes = new Map(
		diff.operations.flatMap((operation) =>
			operation.type === "retime"
				? [[operation.customerProductId, operation.endsAt] as const]
				: [],
		),
	);
	const segmentsById = new Map(
		diff.timeline.map((segment) => [segment.id, segment]),
	);

	const remainingRows = rows
		.filter((row) => !removedIds.has(row.customerProductId))
		.map((row) =>
			retimes.has(row.customerProductId)
				? { ...row, endsAt: retimes.get(row.customerProductId) ?? null }
				: row,
		);
	const insertedRows = diff.operations.flatMap((operation) => {
		if (operation.type !== "insert") return [];
		const segment = segmentsById.get(operation.segmentId);
		return segment ? [segmentRow(segment)] : [];
	});

	return [...remainingRows, ...insertedRows];
};

type ComparableSegment = {
	planId: string;
	internalEntityId: string | null;
	configHash: string;
	startsAt: number;
	endsAt: number | null;
};

const toComparable = (
	segments: (ComparableSegment & { key: string })[],
): string[] => {
	const sorted = [...segments].sort(
		(first, second) =>
			first.key.localeCompare(second.key) || first.startsAt - second.startsAt,
	);
	const merged: (ComparableSegment & { key: string })[] = [];
	for (const segment of sorted) {
		const previous = merged[merged.length - 1];
		const continuesPrevious =
			previous !== undefined &&
			previous.key === segment.key &&
			previous.configHash === segment.configHash &&
			previous.endsAt === segment.startsAt;
		if (previous && continuesPrevious) previous.endsAt = segment.endsAt;
		else merged.push({ ...segment });
	}
	return merged
		.map((segment) =>
			[
				segment.planId,
				segment.internalEntityId ?? "customer",
				segment.configHash,
				Math.max(segment.startsAt, NOW),
				segment.endsAt ?? "never",
			].join("|"),
		)
		.sort();
};

/** I6: executing the operations and re-reading the rows yields exactly the resolved timeline. */
export const expectRoundTrip = ({
	rows,
	diff,
}: {
	rows: TimelineRow[];
	diff: TimelineDiff;
}) => {
	const rebuilt = rowsToSavedTimeline({
		rows: applyTimelineOperations({ rows, diff }),
		now: NOW,
	});
	expect(toComparable(rebuilt.segments)).toEqual(toComparable(diff.timeline));
};

const isChange = (operation: TimelineOperation) => operation.type !== "keep";

const rowKey = (row: ReviewPlanRow) =>
	"after" in row ? row.after.segment.key : row.before.segment.key;

/** I1: a request equal to the saved state writes nothing and shows every plan unchanged. */
export const expectIdempotent = ({
	diff,
	review,
}: {
	diff: TimelineDiff;
	review: ReviewRows;
}) => {
	expect(diff.operations.filter(isChange)).toEqual([]);
	expect(
		review.phases.flatMap(({ rows }) =>
			rows.filter(({ status }) => status !== "kept"),
		),
	).toEqual([]);
	expect(review.removedPhases).toEqual([]);
};

/** R1: a row's plan is in its phase, or, when removed, in what the phase is compared with. */
export const expectRowsInTheirPhase = ({
	diff,
	review,
}: {
	diff: TimelineDiff;
	review: ReviewRows;
}) => {
	for (const [phaseIndex, phase] of review.phases.entries()) {
		const comparedAt =
			phase.comparison.type === "saved"
				? phase.comparison.at
				: (review.phases[phaseIndex - 1]?.at ?? NOW);
		for (const row of phase.rows) {
			const segment = row.status === "ends" ? row.before : row.after;
			const at = row.status === "ends" ? comparedAt : phase.at;
			expect({
				row: rowKey(row),
				alive: isAliveAt({ segment: segment.segment, at }),
			}).toEqual({
				row: rowKey(row),
				alive: true,
			});
			if (row.status !== "ends") {
				expect(diff.timeline).toContain(row.after.segment as ResolvedSegment);
			}
		}
	}
};

const startsNowOperationKeys = (diff: TimelineDiff) =>
	diff.operations.flatMap((operation) =>
		(operation.type === "insert" && operation.startsNow) ||
		operation.type === "expire"
			? [operation.key]
			: [],
	);

/** The plan is ended and inserted again now in the same config, as a recreate policy does. */
const isRecreatedNow = ({
	saved,
	diff,
	key,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	key: string;
}) => {
	const expired = saved.segments.find(
		(segment) => segment.key === key && isAliveAt({ segment, at: NOW }),
	);
	const insertedNow = diff.operations.some(
		(operation) =>
			operation.type === "insert" &&
			operation.startsNow &&
			operation.key === key,
	);
	const resolvedNow = diff.timeline.find(
		(segment) => segment.key === key && isAliveAt({ segment, at: NOW }),
	);
	return insertedNow && expired?.configHash === resolvedNow?.configHash;
};

/** R3: every write that takes effect now has a matching opening-phase change, and the reverse. */
export const expectOpeningPhaseOneToOne = ({
	saved,
	diff,
	review,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	review: ReviewRows;
}) => {
	const openingRows = review.phases[0]?.rows ?? [];
	const changedKeys = new Set(
		openingRows.filter(({ status }) => status !== "kept").map(rowKey),
	);
	const writtenKeys = new Set(startsNowOperationKeys(diff));

	for (const key of writtenKeys) {
		const shown = changedKeys.has(key) || isRecreatedNow({ saved, diff, key });
		expect({ key, shown }).toEqual({ key, shown: true });
	}
	for (const key of changedKeys) {
		expect({ key, written: writtenKeys.has(key) }).toEqual({
			key,
			written: true,
		});
	}
};

const EXTRA_STARTS_AT = NOW + ms.days(50);
const EXTRA_ENDS_AT = NOW + ms.days(55);

const describeReviewRow = (row: ReviewPlanRow) => {
	const before = "before" in row ? row.before.segment.configHash : "-";
	const after = "after" in row ? row.after.segment.configHash : "-";
	return `${rowKey(row)}:${row.status}:${before}->${after}`;
};

const rowsByPhaseStart = (review: ReviewRows) =>
	new Map(
		review.phases.map(({ at, rows }) => [at, rows.map(describeReviewRow)]),
	);

/** The same request with one more phase that adds a short-lived add-on. */
const withExtraPhase = (timelineCase: TimelineCase): TimelineCase => ({
	...timelineCase,
	desired: {
		...timelineCase.desired,
		segments: [
			...timelineCase.desired.segments,
			desiredSegment({
				plan: plan({ planId: "extra", kind: "addOn" }),
				startsAt: EXTRA_STARTS_AT,
				endsAt: EXTRA_ENDS_AT,
				phaseIndex: 9,
				planIndex: 9,
			}),
		],
	},
});

/** R2: adding or deleting one phase never changes the rows of any other phase. */
export const expectPhaseIndependence = (timelineCase: TimelineCase) => {
	const without = rowsByPhaseStart(runTimelineCase(timelineCase).review);
	const withExtra = rowsByPhaseStart(
		runTimelineCase(withExtraPhase(timelineCase)).review,
	);

	for (const [at, rows] of without) {
		expect({ at, rows: withExtra.get(at) }).toEqual({ at, rows });
	}
};

/** R5: no later phase repeats the row the phase before it shows for the same plan. */
export const expectNoCarriedOverRows = ({ review }: { review: ReviewRows }) => {
	for (const [phaseIndex, phase] of review.phases.entries()) {
		const previousRows = new Set(
			(review.phases[phaseIndex - 1]?.rows ?? []).map(describeReviewRow),
		);
		const repeated = phase.rows
			.map(describeReviewRow)
			.filter((row) => previousRows.has(row));
		expect({ at: phase.at, repeated }).toEqual({ at: phase.at, repeated: [] });
	}
};

/** R4: a new phase never shows a plan as removed. */
export const expectNewPhasesHaveNoEnds = ({
	review,
}: {
	review: ReviewRows;
}) => {
	for (const phase of review.phases) {
		if (phase.comparison.type !== "previousPhase") continue;
		expect({
			at: phase.at,
			ends: phase.rows.filter(({ status }) => status === "ends").length,
		}).toEqual({ at: phase.at, ends: 0 });
	}
};

/** I4: the resolved timeline holds every declared segment; an open-ended one carrying or replacing it now keeps its cancel date, moved by a reset-now. */
export const expectProjection = ({
	saved,
	desired,
	policies,
	diff,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
	diff: TimelineDiff;
}) => {
	const cycleResetsNow = policies.liveRows === "recreateRenewing";
	const cancelEnds = new Map(
		saved.segments.flatMap(({ key, rows: [liveRow], endsAt }) =>
			liveRow?.canceling
				? [
						[
							key,
							(cycleResetsNow ? liveRow.periodEndsAtAfterReset : null) ??
								endsAt,
						],
					]
				: [],
		),
	);
	const declared = diff.timeline.filter(({ origin }) => origin === "declared");
	expect(declared).toHaveLength(desired.segments.length);

	for (const desiredSegment of desired.segments) {
		const resolved = declared.find(
			(segment) =>
				segment.key === desiredSegment.key &&
				segment.startsAt === desiredSegment.startsAt,
		);
		expect(resolved?.configHash).toBe(desiredSegment.configHash);
		const cancelEndsAt = cancelEnds.get(desiredSegment.key);
		const keepsCanceledRun =
			resolved?.carriedBy !== undefined ||
			(policies.canceling === "keepCancellation" &&
				desiredSegment.startsAt <= NOW);
		const clipped =
			keepsCanceledRun &&
			cancelEndsAt !== undefined &&
			cancelEndsAt !== null &&
			desiredSegment.endsAt === null;
		expect(resolved?.endsAt).toBe(
			clipped ? cancelEndsAt : desiredSegment.endsAt,
		);
	}
};

/** I5: in retain mode no undeclared live plan ends, unless a declared plan claims its group. */
export const expectRetained = ({
	saved,
	desired,
	diff,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	diff: TimelineDiff;
}) => {
	const declaredKeys = new Set(desired.segments.map(({ key }) => key));
	const undeclaredLive = saved.segments.filter(
		(segment) =>
			!declaredKeys.has(segment.key) &&
			segment.startsAt <= NOW &&
			(segment.endsAt === null || segment.endsAt > NOW),
	);

	for (const savedSegment of undeclaredLive) {
		const claimed = desired.segments.some(
			(segment) =>
				segment.replacementKey === savedSegment.replacementKey &&
				segment.internalEntityId === savedSegment.internalEntityId,
		);
		if (claimed) continue;

		const expired = diff.operations.some(
			(operation) =>
				operation.type === "expire" && operation.key === savedSegment.key,
		);
		expect({ key: savedSegment.key, expired }).toEqual({
			key: savedSegment.key,
			expired: false,
		});
	}
};

export const expectAllInvariants = (timelineCase: TimelineCase) => {
	const result = runTimelineCase(timelineCase);
	const { saved, diff } = result;
	expectRoundTrip({ rows: timelineCase.rows, diff });
	expectProjection({
		saved,
		desired: timelineCase.desired,
		policies: timelineCase.policies,
		diff,
	});
	if (timelineCase.policies.undeclared === "retain") {
		expectRetained({ saved, desired: timelineCase.desired, diff });
	}
	expectRowsInTheirPhase(result);
	expectPhaseIndependence(timelineCase);
	expectOpeningPhaseOneToOne(result);
	expectNewPhasesHaveNoEnds(result);
	expectNoCarriedOverRows(result);
	return result;
};
