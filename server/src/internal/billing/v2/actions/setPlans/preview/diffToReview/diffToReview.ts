import type {
	CustomerPlanChange,
	FullCusProduct,
	LineItem,
	SetPlansPreviewPlan,
	SetPlansPreviewUnlistedPhase,
} from "@autumn/shared";
import { transitionsToCustomerPlanChanges } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToCustomerPlanChanges";
import type {
	TimelineDiff,
	TimelineTransition,
	TransitionKind,
} from "../../timeline/types/timelineDiff";
import {
	sideCustomerProduct,
	type TransitionRowLookup,
	transitionSubject,
} from "./transitionCustomerProducts";
import { transitionToPlanChanges } from "./transitionToPlanChanges";
import { transitionToPreviewPlan } from "./transitionToPreviewPlan";

const KIND_ORDER: TransitionKind[] = ["starts", "updated", "ends", "continues"];

export type SetPlansReview = {
	phases: { plans: SetPlansPreviewPlan[]; planChanges: CustomerPlanChange[] }[];
	unlistedPhases: SetPlansPreviewUnlistedPhase[];
	/** Saved scheduled plans the request withdraws before they start. */
	withdrawnStarts: FullCusProduct[];
};

const byKind = (first: TimelineTransition, second: TimelineTransition) =>
	KIND_ORDER.indexOf(first.kind) - KIND_ORDER.indexOf(second.kind);

/** Phase 0 holds what changes now; a later phase holds what changes at its start. */
const phaseIndexFor = ({
	transition,
	phaseStarts,
	now,
}: {
	transition: TimelineTransition;
	phaseStarts: number[];
	now: number;
}) =>
	transition.at === now
		? 0
		: phaseStarts.findIndex(
				(startsAt, index) => index > 0 && startsAt === transition.at,
			);

const isWithdrawnStart = (transition: TimelineTransition) =>
	transition.origin === "withdrawn" && transition.kind === "starts";

/** Projects the diff's transitions onto preview rows: each request phase, then any other changing date. */
export const diffToReview = ({
	diff,
	phaseStarts,
	lookup,
	creditLineItems,
	currency,
}: {
	diff: TimelineDiff;
	phaseStarts: number[];
	lookup: TransitionRowLookup;
	creditLineItems: LineItem[];
	currency: string;
}): SetPlansReview => {
	const toPlan = (transition: TimelineTransition) =>
		transitionToPreviewPlan({
			transition,
			lookup,
			creditLineItems,
			entities: lookup.originalFullCustomer.entities,
			currency,
			now: diff.now,
		});
	const toPlans = (transitions: TimelineTransition[]) =>
		[...transitions].sort(byKind).flatMap((transition) => {
			const plan = toPlan(transition);
			return plan ? [plan] : [];
		});

	const phaseTransitions = phaseStarts.map(() => [] as TimelineTransition[]);
	const unlistedTransitions = new Map<number, TimelineTransition[]>();
	for (const transition of diff.transitions) {
		const phaseIndex = phaseIndexFor({
			transition,
			phaseStarts,
			now: diff.now,
		});
		if (phaseIndex >= 0) {
			phaseTransitions[phaseIndex]?.push(transition);
			continue;
		}
		unlistedTransitions.set(transition.at, [
			...(unlistedTransitions.get(transition.at) ?? []),
			transition,
		]);
	}

	return {
		phases: phaseTransitions.map((transitions) => ({
			plans: toPlans(transitions),
			planChanges: transitionsToCustomerPlanChanges({
				transitions: transitions.flatMap((transition) =>
					transitionToPlanChanges({ transition, lookup }),
				),
				entities: lookup.originalFullCustomer.entities,
			}),
		})),
		unlistedPhases: [...unlistedTransitions.entries()]
			.sort(([first], [second]) => first - second)
			.map(([startsAt, transitions]) => ({
				starts_at: startsAt,
				plans: toPlans(transitions),
			})),
		withdrawnStarts: diff.transitions
			.filter(isWithdrawnStart)
			.flatMap((transition) => {
				const customerProduct = sideCustomerProduct({
					side: transitionSubject(transition),
					lookup,
				});
				return customerProduct ? [customerProduct] : [];
			}),
	};
};
