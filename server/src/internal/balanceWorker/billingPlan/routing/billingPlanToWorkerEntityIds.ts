import type { AutumnBillingPlan } from "@autumn/shared";
import {
	billingPlanCustomerEntitlements,
	billingPlanCustomerProducts,
} from "./billingPlanRows.js";

type NamedEntity = { internalId: string; id: string };

const namedEntitiesOf = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): NamedEntity[] => [
	...[
		...(autumnBillingPlan.insertEntities ?? []),
		...(autumnBillingPlan.existingEntities ?? []),
	].flatMap((entity) =>
		entity.id ? [{ internalId: entity.internal_id, id: entity.id }] : [],
	),
	...billingPlanCustomerProducts({ autumnBillingPlan }).flatMap(
		({ internal_entity_id, entity_id }) =>
			internal_entity_id && entity_id
				? [{ internalId: internal_entity_id, id: entity_id }]
				: [],
	),
];

export const billingPlanToWorkerEntityIds = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): string[] => [
	...new Set(namedEntitiesOf({ autumnBillingPlan }).map(({ id }) => id)),
];

export const billingPlanNamesItsEntities = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const namedInternalIds = new Set(
		namedEntitiesOf({ autumnBillingPlan }).map(({ internalId }) => internalId),
	);
	const isNamed = (internalEntityId?: string | null) =>
		!internalEntityId || namedInternalIds.has(internalEntityId);
	const insertsNamedEntities = (autumnBillingPlan.insertEntities ?? []).every(
		({ id }) => Boolean(id),
	);
	const customerProducts = billingPlanCustomerProducts({ autumnBillingPlan });
	return (
		insertsNamedEntities &&
		customerProducts.every(
			(customerProduct) =>
				isNamed(customerProduct.internal_entity_id) &&
				customerProduct.customer_entitlements.every(({ internal_entity_id }) =>
					isNamed(internal_entity_id),
				),
		) &&
		billingPlanCustomerEntitlements({ autumnBillingPlan }).every(
			({ internal_entity_id }) => isNamed(internal_entity_id),
		)
	);
};
