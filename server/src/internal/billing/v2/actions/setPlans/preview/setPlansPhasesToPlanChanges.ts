import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerPlanChange,
	cp,
	type Entity,
	type FullCustomer,
	findCustomerProductById,
} from "@autumn/shared";
import { autumnBillingPlanToTransitions } from "@/internal/billing/v2/actions/buildBillingChanges/autumnBillingPlanToCustomerPlanChanges/autumnBillingPlanToTransitions";
import {
	buildCustomerPlanChange,
	type CustomerProductTransition,
} from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildCustomerPlanChange";
import { buildLifecyclePreviousAttributes } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildLifecyclePreviousAttributes";
import { mergeUpdatedPlanChanges } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/mergeUpdatedPlanChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";

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
	const onlyEndedAtChanged =
		changedAttributes.length === 1 && changedAttributes[0] === "expires_at";

	return (
		onlyEndedAtChanged &&
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

const transitionsToPlanChanges = ({
	transitions,
	entities,
}: {
	transitions: CustomerProductTransition[];
	entities: Entity[];
}): CustomerPlanChange[] =>
	mergeUpdatedPlanChanges(
		transitions
			.map((transition) => buildCustomerPlanChange({ ...transition, entities }))
			.filter((change): change is CustomerPlanChange => change !== undefined),
	);

export const setPlansPhasesToPlanChanges = ({
	autumnBillingPlan,
	originalFullCustomer,
	phases,
	phaseCustomers,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	phaseCustomers: FullCustomer[];
}): CustomerPlanChange[][] => {
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

		return transitionsToPlanChanges({
			transitions: [...startingTransitions, ...expiringTransitions],
			entities: originalFullCustomer.entities,
		});
	});
};
