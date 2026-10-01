import type {
	BillingPlan,
	CreateScheduleBillingContext,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { buildSavedPhaseCustomers } from "./balances/buildSavedPhaseCustomers";
import { buildSetPlansPhaseCustomers } from "./buildSetPlansPhaseCustomers";
import { checkoutSessionActionToProcessorItems } from "./processorItems/checkoutSessionActionToProcessorItems";
import { liveScheduleAsUpdateAction } from "./processorItems/liveScheduleAsUpdateAction";
import {
	phasesEndingSubscription,
	scheduleActionToProcessorItems,
} from "./processorItems/scheduleActionToProcessorItems";
import { subscriptionActionToProcessorItems } from "./processorItems/subscriptionActionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { diffToReview, type SetPlansReview } from "./review/diffToReview";
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
	const phaseBalanceChanges = await setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: fullCustomer,
		phaseCustomers,
		savedPhaseCustomers: buildSavedPhaseCustomers({
			ctx,
			fullCustomer,
			autumnBillingPlan,
			phases,
		}),
	});
	const review = diffToReview({
		saved: timeline.saved,
		diff: timeline.diff,
		phaseStarts: phases.map(({ startsAt }) => startsAt),
		lookup: {
			originalFullCustomer: fullCustomer,
			finalFullCustomer: phaseCustomers[0] ?? fullCustomer,
			customerProductIdBySegmentId,
		},
		creditLineItems: immediateCreditLineItems(billingPlan),
		currency: processorItemContext.currency,
	});
	const endsSubscription = phasesEndingSubscription({
		subscriptionAction: stripeBillingPlan.subscriptionAction,
		subscriptionScheduleAction: stripeBillingPlan.subscriptionScheduleAction,
		phases,
	});

	const processorItemsByPhase = [
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
		...scheduleActionToProcessorItems({
			subscriptionScheduleAction:
				stripeBillingPlan.subscriptionScheduleAction ??
				(billingContext.stripeSubscriptionSchedule
					? liveScheduleAsUpdateAction(
							billingContext.stripeSubscriptionSchedule,
						)
					: undefined),
			phases,
			context: processorItemContext,
		}),
	];

	return {
		phases: phases.map((phase, phaseIndex) => ({
			starts_at: phase.startsAt,
			starts_now:
				phaseIndex === 0 &&
				billingContext.subscriptionBackdateStartMs === undefined,
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
