import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

// Svix rejects any tag outside ^[a-zA-Z0-9\-_./#]+$ (or >128 chars) with HTTP
// 422; customer/entity ids carry ':' or '@', so scrub the value before tagging.
const SVIX_TAG_MAX_LENGTH = 128;
const SVIX_TAG_DISALLOWED = /[^a-zA-Z0-9._#/-]/g;

const toSvixTag = (key: string, value: string): string =>
	`${key}.${value.replace(SVIX_TAG_DISALLOWED, "_")}`.slice(
		0,
		SVIX_TAG_MAX_LENGTH,
	);

export const fullCustomerToTags = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): string[] => {
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	const tags = [toSvixTag("customer_id", customerId)];
	const entityId = fullCustomer.entity?.id;
	if (entityId) tags.push(toSvixTag("entity_id", entityId));
	return tags;
};
