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
import { phaseStartsMatch } from "@/internal/billing/v2/utils/phaseStartsMatch";

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

/** A kept plan moved onto a new subscription changes nothing the customer sees. */
const onlyRelinksKeptPlan = ({
	transition: { before, after },
	keptCustomerProductIds,
}: {
	transition: CustomerProductTransition;
	keptCustomerProductIds: Set<string>;
}) =>
	before !== null &&
	after !== null &&
	keptCustomerProductIds.has(after.id) &&
	buildLifecyclePreviousAttributes({ before, after }) === null;

/** Only a phase already in the customer's schedule can have plans taken out of it. */
const phaseExistedBefore = ({
	phaseStartsAt,
	originalFullCustomer,
}: {
	phaseStartsAt: number;
	originalFullCustomer: FullCustomer;
}) =>
	originalFullCustomer.customer_products.some(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Scheduled &&
			phaseStartsMatch({
				startsAt: customerProduct.starts_at,
				otherStartsAt: phaseStartsAt,
			}),
	);

/** The customer's schedule already ended this plan here, so its expiry is not a change. */
const alreadyEndedHere = ({
	customerProduct,
	originalFullCustomer,
}: {
	customerProduct: FullCustomer["customer_products"][number];
	originalFullCustomer: FullCustomer;
}) => {
	const originalCustomerProduct = findCustomerProductById({
		fullCustomer: originalFullCustomer,
		customerProductId: customerProduct.id,
	});
	return (
		originalCustomerProduct?.ended_at != null &&
		customerProduct.ended_at != null &&
		phaseStartsMatch({
			startsAt: originalCustomerProduct.ended_at,
			otherStartsAt: customerProduct.ended_at,
		})
	);
};

const phaseExpiryTransitions = ({
	previousCustomer,
	phaseCustomer,
	originalFullCustomer,
}: {
	previousCustomer: FullCustomer;
	phaseCustomer: FullCustomer;
	originalFullCustomer: FullCustomer;
}): CustomerProductTransition[] =>
	phaseCustomer.customer_products.flatMap((customerProduct) => {
		const previousCustomerProduct = findCustomerProductById({
			fullCustomer: previousCustomer,
			customerProductId: customerProduct.id,
		});
		const expiresInPhase =
			customerProduct.status === CusProductStatus.Expired &&
			previousCustomerProduct !== undefined &&
			cp(previousCustomerProduct).hasActiveStatus().valid &&
			!alreadyEndedHere({ customerProduct, originalFullCustomer });

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
	keptCustomerProductIds,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer: FullCustomer;
	phases: SchedulePhasePlan[];
	phaseCustomers: FullCustomer[];
	keptCustomerProductIds: Set<string>;
}): CustomerProductTransition[][] => {
	const transitions = autumnBillingPlanToTransitions({
		autumnBillingPlan,
		originalFullCustomer,
	}).filter(
		(transition) =>
			!onlyEndsAtLaterPhase({ transition, phases }) &&
			!onlyRelinksKeptPlan({ transition, keptCustomerProductIds }),
	);

	return phases.map((phase, phaseIndex) => {
		const startingTransitions = transitions.filter(
			(transition) =>
				transitionPhaseIndex({ transition, phases }) === phaseIndex,
		);
		const listsExpiries =
			phaseIndex !== IMMEDIATE_PHASE_INDEX &&
			phaseExistedBefore({
				phaseStartsAt: phase.startsAt,
				originalFullCustomer,
			});
		const expiringTransitions = listsExpiries
			? phaseExpiryTransitions({
					previousCustomer: phaseCustomers[phaseIndex - 1],
					phaseCustomer: phaseCustomers[phaseIndex],
					originalFullCustomer,
				})
			: [];

		return [...startingTransitions, ...expiringTransitions];
	});
};
