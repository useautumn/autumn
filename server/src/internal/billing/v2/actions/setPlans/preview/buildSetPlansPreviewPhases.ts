import type {
	BillingPlan,
	CreateScheduleBillingContext,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	classifyFirstPhaseStart,
	firstPhaseStartsInFuture,
} from "../setup/classifyFirstPhaseStart";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { savedComparisonCustomers } from "./balances/savedComparisonCustomers";
import { buildSetPlansPhaseCustomers } from "./buildSetPlansPhaseCustomers";
import { checkoutSessionActionToProcessorItems } from "./processorItems/checkoutSessionActionToProcessorItems";
import { liveScheduleAsUpdateAction } from "./processorItems/liveScheduleAsUpdateAction";
import { scheduleActionToParams } from "./processorItems/scheduleActionToParams";
import {
	phasesEndingSubscription,
	scheduleActionToProcessorItems,
} from "./processorItems/scheduleActionToProcessorItems";
import { subscriptionActionToProcessorItems } from "./processorItems/subscriptionActionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { diffToReview, type SetPlansReview } from "./review/diffToReview";
import { matchReviewPhases } from "./review/matchReviewPhases";
import { setPlansPhaseBalanceChanges } from "./setPlansPhaseBalanceChanges";

/** Credits on the immediate invoice, unless custom line items replace the computed ones. */
const immediateCreditLineItems = (billingPlan: BillingPlan) =>
	billingPlan.autumn.customLineItems?.length
		? []
		: (billingPlan.autumn.lineItems ?? []).filter(
				(lineItem) =>
					lineItem.chargeImmediately && lineItem.amountAfterDiscounts < 0,
			);

export const buildSetPlansPreviewPhases = async ({
	ctx,
	billingContext,
	billingPlan,
	phases,
	timeline,
	customerProductIdBySegmentId,
	processorItemContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SchedulePhasePlan[];
	timeline: Pick<SetPlansTimeline, "saved" | "diff">;
	customerProductIdBySegmentId: Map<string, string>;
	processorItemContext: ProcessorItemContext;
}): Promise<{
	phases: SetPlansPreviewPhase[];
	review: Pick<SetPlansReview, "removedPhases" | "withdrawnStarts">;
}> => {
	const { fullCustomer, stripeSubscription } = billingContext;
	const { autumn: autumnBillingPlan, stripe: stripeBillingPlan } = billingPlan;

	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan,
		phases,
	});
	const matches = matchReviewPhases({
		saved: timeline.saved,
		timeline: timeline.diff.timeline,
		phaseStarts: phases.map(({ startsAt }) => startsAt),
		now: timeline.diff.now,
	});
	const phaseBalanceChanges = await setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: fullCustomer,
		phaseCustomers,
		savedComparisonCustomers: savedComparisonCustomers({
			ctx,
			fullCustomer,
			autumnBillingPlan,
			phases,
			matches,
			now: timeline.diff.now,
		}),
	});
	const review = diffToReview({
		saved: timeline.saved,
		diff: timeline.diff,
		matches,
		lookup: {
			originalFullCustomer: fullCustomer,
			finalFullCustomer: phaseCustomers[0] ?? fullCustomer,
			customerProductIdBySegmentId,
		},
		creditLineItems: immediateCreditLineItems(billingPlan),
		currency: processorItemContext.currency,
		org: processorItemContext.org,
	});
	const endsSubscription = phasesEndingSubscription({
		subscriptionAction: stripeBillingPlan.subscriptionAction,
		subscriptionScheduleAction: stripeBillingPlan.subscriptionScheduleAction,
		phases,
	});

	const subscriptionScheduleAction =
		stripeBillingPlan.subscriptionScheduleAction ??
		(billingContext.stripeSubscriptionSchedule
			? liveScheduleAsUpdateAction(billingContext.stripeSubscriptionSchedule)
			: undefined);
	const firstPhaseOnSchedule =
		firstPhaseStartsInFuture({ billingContext }) &&
		scheduleActionToParams(subscriptionScheduleAction) !== undefined;
	const scheduledPhaseItems = scheduleActionToProcessorItems({
		subscriptionScheduleAction,
		phases: firstPhaseOnSchedule ? phases : phases.slice(1),
		context: processorItemContext,
	});
	const processorItemsByPhase = firstPhaseOnSchedule
		? scheduledPhaseItems
		: [
				[
					...subscriptionActionToProcessorItems({
						subscriptionAction: stripeBillingPlan.subscriptionAction,
						stripeSubscription,
						context: processorItemContext,
					}),
					...checkoutSessionActionToProcessorItems({
						checkoutSessionAction: stripeBillingPlan.checkoutSessionAction,
						context: processorItemContext,
					}),
				],
				...scheduledPhaseItems,
			];

	return {
		phases: phases.map((phase, phaseIndex) => ({
			starts_at: phase.startsAt,
			starts_now:
				phaseIndex === 0 &&
				classifyFirstPhaseStart({
					startsAt: billingContext.immediatePhase.starts_at,
					currentEpochMs: billingContext.currentEpochMs,
				}) === "now",
			ends_subscription: endsSubscription[phaseIndex],
			plans: review.phases[phaseIndex]?.plans ?? [],
			plan_changes: review.phases[phaseIndex]?.planChanges ?? [],
			balance_changes: phaseBalanceChanges[phaseIndex],
			processor_items: processorItemsByPhase[phaseIndex],
		})),
		review: {
			removedPhases: review.removedPhases,
			withdrawnStarts: review.withdrawnStarts,
		},
	};
};
