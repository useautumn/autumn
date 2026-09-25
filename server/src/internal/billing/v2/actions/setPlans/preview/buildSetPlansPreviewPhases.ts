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
import { checkoutSessionActionToProcessorItems } from "./processorItems/checkoutSessionActionToProcessorItems";
import { scheduleActionToProcessorItems } from "./processorItems/scheduleActionToProcessorItems";
import { subscriptionActionToProcessorItems } from "./processorItems/subscriptionActionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { setPlansPhasesToPlanChanges } from "./setPlansPhasesToPlanChanges";

export const buildSetPlansPreviewPhases = async ({
	ctx,
	billingContext,
	billingPlan,
	phases,
	processorItemContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SchedulePhasePlan[];
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
	const planChanges = setPlansPhasesToPlanChanges({
		autumnBillingPlan,
		originalFullCustomer: fullCustomer,
		phases,
		phaseCustomers,
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
			subscriptionScheduleAction: stripeBillingPlan.subscriptionScheduleAction,
			phases,
			context: processorItemContext,
		}),
	];

	return phases.map((phase, phaseIndex) => ({
		starts_at: phase.startsAt,
		plan_changes: planChanges[phaseIndex],
		balance_changes: buildBalanceChanges({
			beforeBalances: phaseBalances[phaseIndex].balances,
			afterBalances: phaseBalances[phaseIndex + 1].balances,
		}),
		processor_items: processorItemsByPhase[phaseIndex],
	}));
};
