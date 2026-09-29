import {
	type AutumnBillingPlan,
	CusProductStatus,
	cp,
	type FullCustomer,
	findCustomerProductById,
} from "@autumn/shared";
import { autumnBillingPlanToTransitions } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToTransitions";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildCustomerPlanChange";
import { buildLifecyclePreviousAttributes } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildLifecyclePreviousAttributes";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";

const IMMEDIATE_PHASE_INDEX = 0;

const transitionPhaseIndex = ({
	transition,
	phases,
}: {
	transition: CustomerProductTransition;
	phases: SchedulePhasePlan[];
}) => {
	const customerProductId = transition.after?.id;
	const phaseIndex = phases.findIndex(
		(phase) =>
			customerProductId !== undefined &&
			phase.customerProductIds.includes(customerProductId),
	);
	return phaseIndex >= 0 ? phaseIndex : IMMEDIATE_PHASE_INDEX;
};

/** Ending a kept plan at a later phase surfaces as that phase's expiry, not as an immediate update. */
const onlyEndsAtLaterPhase = ({
	transition: { before, after },
	phases,
}: {
	transition: CustomerProductTransition;
	phases: SchedulePhasePlan[];
}) => {
	if (!before || !after) return false;

	const changedAttributes = Object.keys(
		buildLifecyclePreviousAttributes({ before, after }) ?? {},
	);
	const onlyExpiresAtChanged =
		changedAttributes.length === 1 && changedAttributes[0] === "expires_at";

	return (
		onlyExpiresAtChanged &&
		phases
			.slice(IMMEDIATE_PHASE_INDEX + 1)
			.some((phase) => phase.startsAt === after.ended_at)
	);
};

const phaseExpiryTransitions = ({
	previousCustomer,
	phaseCustomer,
}: {
	previousCustomer: FullCustomer;
	phaseCustomer: FullCustomer;
}): CustomerProductTransition[] =>
	phaseCustomer.customer_products.flatMap((customerProduct) => {
		const previousCustomerProduct = findCustomerProductById({
			fullCustomer: previousCustomer,
			customerProductId: customerProduct.id,
		});
		const expiresInPhase =
			customerProduct.status === CusProductStatus.Expired &&
			previousCustomerProduct !== undefined &&
			cp(previousCustomerProduct).hasActiveStatus().valid;

		return expiresInPhase
			? [{ before: previousCustomerProduct, after: customerProduct }]
			: [];
	});

/** Each phase's customer product transitions: what starts in it plus what it expires. */
export const setPlansPhaseTransitions = ({
	autumnBillingPlan,
	originalFullCustomer,
	phases,
	phaseCustomers,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	phaseCustomers: FullCustomer[];
}): CustomerProductTransition[][] => {
	const transitions = autumnBillingPlanToTransitions({
		autumnBillingPlan,
		originalFullCustomer,
	}).filter((transition) => !onlyEndsAtLaterPhase({ transition, phases }));

	return phases.map((_, phaseIndex) => {
		const startingTransitions = transitions.filter(
			(transition) =>
				transitionPhaseIndex({ transition, phases }) === phaseIndex,
		);
		const expiringTransitions =
			phaseIndex === IMMEDIATE_PHASE_INDEX
				? []
				: phaseExpiryTransitions({
						previousCustomer: phaseCustomers[phaseIndex - 1],
						phaseCustomer: phaseCustomers[phaseIndex],
					});

		return [...startingTransitions, ...expiringTransitions];
	});
};
