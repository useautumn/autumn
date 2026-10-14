import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

// Svix rejects any tag outside ^[a-zA-Z0-9\-_./#]+$ (or >128 chars) with HTTP
const SVIX_TAG_MAX_LENGTH = 128;
const SVIX_TAG_DISALLOWED = /[^a-zA-Z0-9._#/-]/g;

const toSvixTag = (key: string, value: string): string =>
	`${key}.${value.replace(SVIX_TAG_DISALLOWED, "_")}`.slice(
		0,
		SVIX_TAG_MAX_LENGTH,
	);

export const customerToSvixTags = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId?: string | null;
}): string[] => {
	const tags = [toSvixTag("customer_id", customerId)];
	if (entityId) tags.push(toSvixTag("entity_id", entityId));
	return tags;
};

export const fullCustomerToTags = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}): string[] =>
	customerToSvixTags({
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		entityId: fullCustomer.entity?.id,
	});
