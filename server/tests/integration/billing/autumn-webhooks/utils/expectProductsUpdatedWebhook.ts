import { expect } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, ApiProduct } from "@autumn/shared";
import { waitForWebhook } from "@tests/integration/utils/svixWebhookTestUtils.js";

export type CustomerProductsUpdatedPayload = {
	type: string;
	data: {
		scenario: string;
		customer: ApiCustomerV3;
		updated_product: ApiProduct;
		entity?: ApiEntityV0;
	};
};

/**
 * Polls Svix Play for a customer.products.updated delivery. Returns the
 * payload data, or null when none arrives in time. `entityId: null` requires
 * a customer-level delivery; a string requires that entity's delivery.
 */
export const waitForProductsUpdatedWebhook = async ({
	playToken,
	customerId,
	scenario,
	entityId,
	timeoutMs = 15_000,
}: {
	playToken: string;
	customerId: string;
	scenario?: string;
	entityId?: string | null;
	timeoutMs?: number;
}): Promise<CustomerProductsUpdatedPayload["data"] | null> => {
	const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
		token: playToken,
		predicate: (payload) =>
			payload.type === "customer.products.updated" &&
			payload.data?.customer?.id === customerId &&
			(scenario === undefined || payload.data?.scenario === scenario) &&
			(entityId === undefined ||
				(entityId === null
					? payload.data?.entity == null
					: payload.data?.entity?.id === entityId)),
		timeoutMs,
		logWebhook: false,
	});
	return result?.payload.data ?? null;
};

/** Declarative assertions over a delivered customer.products.updated payload.
 * Only the fields provided are checked, expectBalanceCorrect-style. */
export const expectProductsUpdatedCorrect = ({
	data,
	customerId,
	planId,
	scenario = "new",
	entityId,
	features,
}: {
	data: CustomerProductsUpdatedPayload["data"] | null;
	customerId: string;
	planId?: string;
	scenario?: string;
	/** null asserts a customer-level payload (no entity). */
	entityId?: string | null;
	/** Features the embedded customer must carry, with optional balances. */
	features?: { featureId: string; balance?: number }[];
}) => {
	expect(data).not.toBeNull();
	expect(data?.scenario).toBe(scenario);
	expect(data?.customer?.id).toBe(customerId);

	if (planId !== undefined) expect(data?.updated_product?.id).toBe(planId);

	if (entityId !== undefined) {
		if (entityId === null) {
			expect(data?.entity).toBeUndefined();
		} else {
			expect(data?.entity?.id).toBe(entityId);
		}
	}

	for (const feature of features ?? []) {
		const customerFeature = data?.customer?.features?.[feature.featureId];
		expect(
			customerFeature,
			`missing feature ${feature.featureId} on webhook customer`,
		).toBeDefined();
		if (feature.balance !== undefined) {
			expect(customerFeature).toMatchObject({ balance: feature.balance });
		}
	}
};
