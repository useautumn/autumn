import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

// Svix tag chars must match [a-zA-Z0-9\-_.], so we separate key/value with `.`
// instead of `:` (rejected with HTTP 422 at message creation).
export const fullCustomerToTags = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): string[] => {
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	const tags = [`customer_id.${customerId}`];
	const entityId = fullCustomer.entity?.id;
	if (entityId) tags.push(`entity_id.${entityId}`);
	return tags;
};
