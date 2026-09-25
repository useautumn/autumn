import type { AutumnBillingPlan } from "@autumn/shared";
import {
	billingPlanCustomerEntitlements,
	billingPlanCustomerProducts,
} from "./billingPlanRows.js";

type NamedEntity = { internalId: string; id: string };

/** Entities the plan can name by external id: the ones it creates, the existing ones it lists, and the ones its products are provisioned on. */
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

/** The entities whose rows the plan writes, by external id: the worker applies their parts beside the customer's. */
export const billingPlanToWorkerEntityIds = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): string[] => [
	...new Set(namedEntitiesOf({ autumnBillingPlan }).map(({ id }) => id)),
];

/** Every entity-scoped row belongs to an entity the plan can name; any other would have no subject to land in. */
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
