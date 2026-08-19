import {
	type BillingInterval,
	ResetInterval,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";

export const messagesItem = (
	included: number,
	interval: ResetInterval = ResetInterval.Month,
) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval },
});

export const wordsItem = (included: number) => ({
	feature_id: TestFeature.Words,
	included,
	reset: { interval: ResetInterval.Month },
});

export const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

type CatalogV2Update = {
	catalogV2: {
		update: (params: { plans: UpdateCatalogPlanParams[] }) => Promise<unknown>;
	};
};

export const seedTwoPlanVersions = async ({
	autumn,
	planId,
	v1Items,
	v2Items,
	v1Price,
	v2Price,
}: {
	autumn: CatalogV2Update;
	planId: string;
	v1Items: UpdateCatalogPlanParams["items"];
	v2Items: UpdateCatalogPlanParams["items"];
	v1Price?: { amount: number; interval: BillingInterval };
	v2Price?: { amount: number; interval: BillingInterval };
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "V1",
				items: v1Items,
				...(v1Price ? { price: v1Price } : {}),
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				version: 2,
				name: "V2",
				items: v2Items,
				...(v2Price ? { price: v2Price } : {}),
			},
		],
	});
};
