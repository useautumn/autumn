import type {
	Feature,
	ProductV2,
	SyncParamsV1,
	SyncPhase,
	SyncPlanInstance,
	SyncProposalV2,
} from "@autumn/shared";
import { customerStatePlanToApiPlan } from "@/components/forms/customer-state/customerStatePlanToApiPlan";
import type {
	CustomerStateForm,
	CustomerStatePlan,
} from "@/components/forms/customer-state/customerStateSchema";

const toSyncPlan = ({
	plan,
	products,
	features,
	expirePrevious,
	enableImmediately,
}: {
	plan: CustomerStatePlan;
	products: ProductV2[];
	features: Feature[];
	expirePrevious: boolean;
	enableImmediately: boolean;
}): SyncPlanInstance => {
	const { entity_id: _entityId, ...apiPlan } = customerStatePlanToApiPlan({
		plan,
		products,
		features,
	});
	return {
		...apiPlan,
		customize: apiPlan.customize as SyncPlanInstance["customize"],
		entity_id: plan.entityId ?? undefined,
		quantity: plan.quantity,
		license_quantities: plan.licenseQuantities,
		expire_previous: expirePrevious,
		enable_plan_immediately: enableImmediately ? true : undefined,
	};
};

/** The customer state as a `/billing.sync` request, phase by phase. */
export const customerStateToSyncParams = ({
	customerId,
	proposal,
	formValues,
	products,
	features,
	expirePrevious,
	carryOverUsage,
}: {
	customerId: string;
	proposal: SyncProposalV2;
	formValues: CustomerStateForm;
	products: ProductV2[];
	features: Feature[];
	expirePrevious: boolean;
	carryOverUsage: boolean;
}): SyncParamsV1 | null => {
	const isNotStartedSchedule =
		!proposal.stripe_subscription_id && Boolean(proposal.stripe_schedule_id);
	const firstFuturePhaseIndex = proposal.phases.findIndex(
		(phase) => phase.starts_at !== "now",
	);

	const toSyncPlans = ({
		plans,
		enableImmediately,
	}: {
		plans: CustomerStatePlan[];
		enableImmediately: boolean;
	}) =>
		plans.flatMap((plan) =>
			plan.productId
				? [
						toSyncPlan({
							plan,
							products,
							features,
							expirePrevious,
							enableImmediately,
						}),
					]
				: [],
		);

	const phases: SyncPhase[] = proposal.phases.flatMap((phase, phaseIndex) => {
		const plans = toSyncPlans({
			plans: formValues.phases[phaseIndex]?.plans ?? [],
			enableImmediately:
				isNotStartedSchedule &&
				formValues.enablePlanImmediately &&
				phaseIndex === firstFuturePhaseIndex,
		});
		return plans.length > 0 ? [{ starts_at: phase.starts_at, plans }] : [];
	});
	const unscheduledPlans = toSyncPlans({
		plans: formValues.unscheduledPlans,
		enableImmediately: false,
	});

	if (phases.length === 0 && unscheduledPlans.length === 0) return null;

	return {
		customer_id: customerId,
		stripe_subscription_id: proposal.stripe_subscription_id,
		stripe_schedule_id: proposal.stripe_schedule_id,
		phases,
		...(unscheduledPlans.length > 0
			? { unscheduled_plans: unscheduledPlans }
			: {}),
		carry_over_usage: carryOverUsage,
	};
};
