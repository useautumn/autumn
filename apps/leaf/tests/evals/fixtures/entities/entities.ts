import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiEntityV2 } from "@api/entities/apiEntityV2.js";
import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";

const defaultCreatedAt = new Date("2026-01-01T00:00:00.000Z");

export const entities = {
	base: ({
		createdAt = defaultCreatedAt,
		customer,
		feature,
		id = "entity_fixture",
		name = "Entity Fixture",
	}: {
		customer: BaseApiCustomerV5;
		feature: ApiFeatureV1;
		id?: string | null;
		name?: string | null;
		createdAt?: Date;
	}): ApiEntityV2 => ({
		balances: {},
		billing_controls: {},
		created_at: createdAt.getTime(),
		customer_id: customer.id,
		env: customer.env,
		feature_id: feature.id,
		flags: {},
		id,
		name,
		purchases: [],
		subscriptions: [],
	}),
	list: ({
		count,
		customer,
		feature,
		idPrefix = "entity",
		namePrefix = "Entity",
	}: {
		count: number;
		customer: BaseApiCustomerV5;
		feature: ApiFeatureV1;
		idPrefix?: string;
		namePrefix?: string;
	}) =>
		Array.from({ length: count }, (_, index) =>
			entities.base({
				customer,
				feature,
				id: `${idPrefix}_${index + 1}`,
				name: `${namePrefix} ${index + 1}`,
			}),
		),
} as const;
