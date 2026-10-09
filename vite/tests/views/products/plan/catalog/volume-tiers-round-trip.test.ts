import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type CreatePlanItemParamsV1,
	CreatePlanItemParamsV1Schema,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FrontendProduct,
	ProductItemInterval,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared";
import { buildUpdateCatalogPlanParams } from "@/views/products/plan/catalog/buildUpdateCatalogPlanParams";
import {
	cleanVolumeTiersForCommit,
	tiersToVolumePricingMode,
} from "@/views/products/plan/utils/tierUtils";

const messages: Feature = {
	internal_id: "fe_messages",
	org_id: "org_1",
	created_at: 1,
	env: AppEnv.Sandbox,
	id: "messages",
	name: "Messages",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	display: null,
	archived: false,
	event_names: [],
};

const ctx = {
	org: { config: {}, default_currency: "usd" },
	env: AppEnv.Sandbox,
	features: [messages],
	expand: [],
} as unknown as SharedContext;

const apiTiers = [
	{ to: 200, amount: 1, flat_amount: 5 },
	{ to: 500, amount: 0.8 },
	{ to: "inf" as const, amount: 0.5, flat_amount: 20 },
];

const apiItem: CreatePlanItemParamsV1 = CreatePlanItemParamsV1Schema.parse({
	feature_id: "messages",
	included: 100,
	reset: { interval: "month" },
	price: {
		tiers: apiTiers,
		tier_behavior: "volume",
		interval: "month",
		billing_units: 1,
		billing_method: "prepaid",
	},
});

/** What the dashboard loads for a plan item created through the V1 API. */
const dashboardItem = planItemV0ToProductItem({
	ctx,
	planItem: planItemV1ToV0({ ctx, item: apiItem }),
});

const product = (items: FrontendProduct["items"]): FrontendProduct => ({
	id: "pro",
	name: "Pro",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 1,
	group: "",
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [
		{ price: 20, interval: ProductItemInterval.Month, interval_count: 1 },
		...items,
	],
	created_at: 1,
	archived: false,
	planType: "paid",
	basePriceType: "recurring",
});

describe("API-created volume item saved from the dashboard", () => {
	test("opens in the Unit + Flat mode", () => {
		expect(tiersToVolumePricingMode({ tiers: dashboardItem.tiers })).toBe(
			"per_unit_and_flat",
		);
	});

	test("save keeps every tier amount and flat fee", () => {
		const committed = cleanVolumeTiersForCommit({ item: dashboardItem });
		const params = buildUpdateCatalogPlanParams({
			baseProduct: product([dashboardItem]),
			editedProduct: product([committed]),
			features: [messages],
		});
		const body = JSON.parse(JSON.stringify(params));
		const savedItem = body.items.find(
			(item: { feature_id?: string }) => item.feature_id === "messages",
		);

		expect(savedItem.included).toBe(100);
		expect(savedItem.price.tier_behavior).toBe("volume");
		expect(
			savedItem.price.tiers.map(
				({ to, amount, flat_amount }: (typeof apiTiers)[number]) => ({
					to,
					amount,
					...(flat_amount ? { flat_amount } : {}),
				}),
			),
		).toEqual(apiTiers);
		expect(() => UpdateCatalogPlanParamsSchema.parse(body)).not.toThrow();
	});
});
