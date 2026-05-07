import {
	ApiEntityListItemSchema,
	type ApiEntityListItem,
	type Customer,
	type Entity,
} from "@autumn/shared";

type EntityListCustomer = Pick<Customer, "id" | "internal_id" | "env">;

export const getApiEntityListItem = ({
	entity,
	customer,
	withAutumnId = false,
}: {
	entity: Entity;
	customer: EntityListCustomer;
	withAutumnId?: boolean;
}): ApiEntityListItem => {
	const billingControls = {
		spend_limits: entity.spend_limits ?? undefined,
		usage_alerts: entity.usage_alerts ?? undefined,
		overage_allowed: entity.overage_allowed ?? undefined,
	};
	const hasBillingControls = Object.values(billingControls).some(
		(value) => value !== undefined,
	);
	return ApiEntityListItemSchema.parse({
		autumn_id: withAutumnId ? entity.internal_id : undefined,
		id: entity.id ?? null,
		name: entity.name ?? null,
		customer_id: customer.id ?? customer.internal_id,
		feature_id: entity.feature_id ?? undefined,
		created_at: entity.created_at,
		env: customer.env,
		billing_controls: hasBillingControls ? billingControls : undefined,
	});
};
