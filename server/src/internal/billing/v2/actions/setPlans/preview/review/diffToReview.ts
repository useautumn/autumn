import type {
	CustomerPlanChange,
	FullCusProduct,
	LineItem,
	Organization,
	SetPlansPreviewPlan,
	SetPlansPreviewRemovedPhase,
} from "@autumn/shared";
import { transitionsToCustomerPlanChanges } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToCustomerPlanChanges";
import type { SavedTimeline } from "../../timeline/types/timeline";
import type { TimelineDiff } from "../../timeline/types/timelineDiff";
import { ongoingContextFor } from "./ongoingContextFor";
import { reviewRowToPlanChange } from "./reviewRowToPlanChange";
import { reviewRowToPreviewPlan } from "./reviewRowToPreviewPlan";
import type { ReviewRowLookup } from "./reviewSegmentCustomerProduct";
import { timelineToReviewRows } from "./timelineToReviewRows";
import type { ReviewPhaseMatches, ReviewPlanRow } from "./types/reviewPhase";
import { withdrawnScheduledStarts } from "./withdrawnScheduledStarts";

export type SetPlansReview = {
	phases: { plans: SetPlansPreviewPlan[]; planChanges: CustomerPlanChange[] }[];
	removedPhases: SetPlansPreviewRemovedPhase[];
	/** Saved scheduled plans the request withdraws before they start. */
	withdrawnStarts: FullCusProduct[];
};

/** The diff as preview rows: each request phase compared with itself, and the saved phases it removes. */
export const diffToReview = ({
	saved,
	diff,
	matches,
	lookup,
	creditLineItems,
	currency,
	org,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	matches: ReviewPhaseMatches;
	lookup: ReviewRowLookup;
	creditLineItems: LineItem[];
	currency: string;
	org: Organization;
}): SetPlansReview => {
	const { entities } = lookup.originalFullCustomer;
	const ongoingContext = ongoingContextFor({ saved, now: diff.now });
	const toPlans = ({
		rows,
		phaseStartsAt,
		phaseCredits,
	}: {
		rows: ReviewPlanRow[];
		phaseStartsAt: number;
		phaseCredits: LineItem[];
	}) =>
		rows.flatMap((row) => {
			const plan = reviewRowToPreviewPlan({
				row,
				phaseStartsAt,
				lookup,
				creditLineItems: phaseCredits,
				entities,
				currency,
				org,
				ongoingContext,
			});
			return plan ? [plan] : [];
		});

	const reviewRows = timelineToReviewRows({ saved, diff, matches });

	return {
		phases: reviewRows.phases.map(({ at, rows }, phaseIndex) => ({
			plans: toPlans({
				rows,
				phaseStartsAt: at,
				phaseCredits: phaseIndex === 0 ? creditLineItems : [],
			}),
			planChanges: transitionsToCustomerPlanChanges({
				transitions: rows.flatMap((row) =>
					reviewRowToPlanChange({ row, lookup }),
				),
				entities,
			}),
		})),
		removedPhases: reviewRows.removedPhases.map(({ at, rows }) => ({
			starts_at: at,
			plans: toPlans({ rows, phaseStartsAt: at, phaseCredits: [] }),
		})),
		withdrawnStarts: withdrawnScheduledStarts({
			saved,
			diff,
			originalFullCustomer: lookup.originalFullCustomer,
		}),
	};
};
