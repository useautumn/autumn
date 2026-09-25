import { getApiBalances } from "@api/customers/cusFeatures";
import type {
	BillingPlan,
	CreateScheduleBillingContext,
	SetPlansPreviewPhase,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBalanceChanges } from "@/internal/billing/v2/actions/buildBillingChanges/buildBalanceChanges/buildBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { buildSetPlansPhaseCustomers } from "./buildSetPlansPhaseCustomers";
import { buildAutumnStripePriceIndex } from "./processorItems/buildAutumnStripePriceIndex";
import { checkoutSessionActionToProcessorItemChanges } from "./processorItems/checkoutSessionActionToProcessorItemChanges";
import { scheduleActionToProcessorItemChanges } from "./processorItems/scheduleActionToProcessorItemChanges";
import { subscriptionActionToProcessorItemChanges } from "./processorItems/subscriptionActionToProcessorItemChanges";
import { setPlansPhasesToPlanChanges } from "./setPlansPhasesToPlanChanges";

export const buildSetPlansPreviewPhases = async ({
	ctx,
	billingContext,
	billingPlan,
	phases,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SchedulePhasePlan[];
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
	const planChanges = setPlansPhasesToPlanChanges({
		autumnBillingPlan,
		originalFullCustomer: fullCustomer,
		phases,
		phaseCustomers,
	});

	const priceIndex = buildAutumnStripePriceIndex({
		customerProducts: [
			...fullCustomer.customer_products,
			...autumnBillingPlan.insertCustomerProducts,
		],
		features: ctx.features,
	});
	const itemChangesByPhase = [
		[
			...subscriptionActionToProcessorItemChanges({
				subscriptionAction: stripeBillingPlan.subscriptionAction,
				stripeSubscription,
				priceIndex,
			}),
			...checkoutSessionActionToProcessorItemChanges({
				checkoutSessionAction: stripeBillingPlan.checkoutSessionAction,
				priceIndex,
			}),
		],
		...scheduleActionToProcessorItemChanges({
			subscriptionScheduleAction: stripeBillingPlan.subscriptionScheduleAction,
			phases,
			priceIndex,
		}),
	];

	return phases.map((phase, phaseIndex) => ({
		starts_at: phase.startsAt,
		plan_changes: planChanges[phaseIndex],
		balance_changes: buildBalanceChanges({
			beforeBalances: phaseBalances[phaseIndex].balances,
			afterBalances: phaseBalances[phaseIndex + 1].balances,
		}),
		processor_item_changes: itemChangesByPhase[phaseIndex],
	}));
};
