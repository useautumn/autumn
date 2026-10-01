import { getApiBalances } from "@api/customers/cusFeatures";
import type {
	BillingPlan,
	CreateScheduleBillingContext,
	FullCusProduct,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { transitionsToCustomerPlanChanges } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToCustomerPlanChanges";
import { buildBalanceChanges } from "@/internal/billing/v2/actions/buildBillingChanges/buildBalanceChanges/buildBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { buildSetPlansPhaseCustomers } from "./buildSetPlansPhaseCustomers";
import { classifySetPlansBalanceChange } from "./classifySetPlansBalanceChange";
import { checkoutSessionActionToProcessorItems } from "./processorItems/checkoutSessionActionToProcessorItems";
import { liveScheduleAsUpdateAction } from "./processorItems/liveScheduleAsUpdateAction";
import {
	phasesEndingSubscription,
	scheduleActionToProcessorItems,
} from "./processorItems/scheduleActionToProcessorItems";
import { subscriptionActionToProcessorItems } from "./processorItems/subscriptionActionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { setPlansPhasePlans } from "./setPlansPhasePlans";
import { setPlansPhaseTransitions } from "./setPlansPhaseTransitions";

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
	keptCustomerProducts,
	processorItemContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SchedulePhasePlan[];
	keptCustomerProducts: FullCusProduct[];
	processorItemContext: ProcessorItemContext;
}): Promise<SetPlansPreviewPhase[]> => {
	const { fullCustomer, stripeSubscription } = billingContext;
	const { autumn: autumnBillingPlan, stripe: stripeBillingPlan } = billingPlan;

	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan,
		phases,
	});
	const phaseBalances = await Promise.all(
		[fullCustomer, ...phaseCustomers].map((phaseCustomer) =>
			getApiBalances({ ctx, fullCus: phaseCustomer }),
		),
	);
	const phaseTransitions = setPlansPhaseTransitions({
		autumnBillingPlan,
		originalFullCustomer: fullCustomer,
		phases,
		phaseCustomers,
		keptCustomerProductIds: new Set(
			keptCustomerProducts.map((customerProduct) => customerProduct.id),
		),
	});
	const phasePlans = setPlansPhasePlans({
		phases,
		phaseCustomers,
		originalFullCustomer: fullCustomer,
		features: ctx.features,
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

	return phases.map((phase, phaseIndex) => ({
		starts_at: phase.startsAt,
		starts_now:
			phaseIndex === 0 &&
			billingContext.subscriptionBackdateStartMs === undefined,
		ends_subscription: endsSubscription[phaseIndex],
		plans: phasePlans[phaseIndex],
		plan_changes: transitionsToCustomerPlanChanges({
			transitions: phaseTransitions[phaseIndex],
			entities: fullCustomer.entities,
		}),
		balance_changes: buildBalanceChanges({
			beforeBalances: phaseBalances[phaseIndex].balances,
			afterBalances: phaseBalances[phaseIndex + 1].balances,
		}).map(classifySetPlansBalanceChange),
		processor_items: processorItemsByPhase[phaseIndex],
	}));
};
