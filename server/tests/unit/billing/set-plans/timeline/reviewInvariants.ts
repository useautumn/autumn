import { expect } from "bun:test";
import { ms } from "@autumn/shared";
import { timelineToReviewRows } from "@/internal/billing/v2/actions/setPlans/preview/review/timelineToReviewRows";
import type { ReviewPlanRow } from "@/internal/billing/v2/actions/setPlans/preview/review/types/reviewPhase";
import type { DesiredTimeline } from "@/internal/billing/v2/actions/setPlans/timeline/types/timeline";
import { desiredSegment, NOW, plan } from "./timelineFixtures";
import { runTimelineCase, type TimelineCase } from "./timelineInvariants";

const EXTRA_STARTS_AT = NOW + ms.days(50);
const EXTRA_ENDS_AT = NOW + ms.days(55);

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

const reviewRowsFor = (timelineCase: TimelineCase) => {
	const { saved, diff } = runTimelineCase(timelineCase);
	return timelineToReviewRows({
		saved,
		diff,
		phaseStarts: requestPhaseStarts(timelineCase.desired),
	});
};

const describeRow = (row: ReviewPlanRow) => {
	const before = "before" in row ? row.before.segment.configHash : "-";
	const after = "after" in row ? row.after.segment.configHash : "-";
	const key = "after" in row ? row.after.segment.key : row.before.segment.key;
	return `${key}:${row.status}:${before}->${after}`;
};

const rowsByPhase = (reviewRows: ReturnType<typeof reviewRowsFor>) =>
	new Map(reviewRows.phases.map(({ at, rows }) => [at, rows.map(describeRow)]));

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
	const without = rowsByPhase(reviewRowsFor(timelineCase));
	const withExtra = rowsByPhase(reviewRowsFor(withExtraPhase(timelineCase)));

	for (const [at, rows] of without) {
		expect({ at, rows: withExtra.get(at) }).toEqual({ at, rows });
	}
};

/** R4: a new phase never shows a plan as removed. */
export const expectNewPhasesHaveNoEnds = (timelineCase: TimelineCase) => {
	for (const phase of reviewRowsFor(timelineCase).phases) {
		if (phase.comparison.type !== "previousPhase") continue;
		expect({
			at: phase.at,
			ends: phase.rows.filter(({ status }) => status === "ends").length,
		}).toEqual({ at: phase.at, ends: 0 });
	}
};

export const expectReviewInvariants = (timelineCase: TimelineCase) => {
	expectPhaseIndependence(timelineCase);
	expectNewPhasesHaveNoEnds(timelineCase);
};
