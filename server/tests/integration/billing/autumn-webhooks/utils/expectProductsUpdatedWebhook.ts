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

type CustomerFeatureExpectation = { featureId: string; balance?: number };

const payloadHasExpectedFeatures = ({
	data,
	features,
	absentFeatureIds,
}: {
	data: CustomerProductsUpdatedPayload["data"];
	features?: CustomerFeatureExpectation[];
	absentFeatureIds?: string[];
}): boolean =>
	(features ?? []).every(({ featureId, balance }) => {
		const feature = data.customer?.features?.[featureId];
		return (
			feature !== undefined &&
			(balance === undefined || feature.balance === balance)
		);
	}) &&
	(absentFeatureIds ?? []).every(
		(featureId) => data.customer?.features?.[featureId] === undefined,
	);

export const waitForProductsUpdatedWebhook = async ({
	playToken,
	customerId,
	scenario,
	entityId,
	planId,
	planVersion,
	features,
	absentFeatureIds,
	timeoutMs = 15_000,
}: {
	playToken: string;
	customerId: string;
	scenario?: string;
	entityId?: string | null;
	planId?: string;
	planVersion?: number;
	features?: CustomerFeatureExpectation[];
	absentFeatureIds?: string[];
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
					: payload.data?.entity?.id === entityId)) &&
			(planId === undefined || payload.data?.updated_product?.id === planId) &&
			(planVersion === undefined ||
				payload.data?.updated_product?.version === planVersion) &&
			payloadHasExpectedFeatures({
				data: payload.data,
				features,
				absentFeatureIds,
			}),
		timeoutMs,
		logWebhook: false,
	});
	return result?.payload.data ?? null;
};

export const expectProductsUpdatedCorrect = ({
	data,
	customerId,
	planId,
	scenario = "new",
	entityId,
	features,
	absentFeatureIds,
}: {
	data: CustomerProductsUpdatedPayload["data"] | null;
	customerId: string;
	planId?: string;
	scenario?: string;
	entityId?: string | null;
	features?: CustomerFeatureExpectation[];
	absentFeatureIds?: string[];
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
	for (const featureId of absentFeatureIds ?? []) {
		expect(data?.customer?.features?.[featureId]).toBeUndefined();
	}
};
