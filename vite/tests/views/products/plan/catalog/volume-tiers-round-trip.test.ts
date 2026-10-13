import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type CreatePlanItemParamsV1,
	CreatePlanItemParamsV1Schema,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FrontendProduct,
	type PriceTier,
	ProductItemInterval,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared";
import { buildUpdateCatalogPlanParams } from "@/views/products/plan/catalog/buildUpdateCatalogPlanParams";
import { updateTierPrice } from "@/views/products/plan/utils/tierUtils";

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

const saveItem = (item: FrontendProduct["items"][number]) => {
	const params = buildUpdateCatalogPlanParams({
		baseProduct: product([dashboardItem]),
		editedProduct: product([item]),
		features: [messages],
	});
	const body = JSON.parse(JSON.stringify(params));
	expect(() => UpdateCatalogPlanParamsSchema.parse(body)).not.toThrow();
	return body.items.find(
		(saved: { feature_id?: string }) => saved.feature_id === "messages",
	);
};

describe("API-created volume item saved from the dashboard", () => {
	test("loads each tier's flat fee onto its own row, blank where unset", () => {
		expect(
			dashboardItem.tiers?.map((tier: PriceTier) => tier.flat_amount),
		).toEqual([5, undefined, 20]);
	});

	test("save keeps every tier amount and flat fee", () => {
		const savedItem = saveItem(dashboardItem);

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
	});

	test("an EUR flat fee on the tier without a USD flat fee saves", () => {
		const withEur = updateTierPrice({
			item: {
				...dashboardItem,
				base_currency: "usd",
				tiers: dashboardItem.tiers?.map((tier: PriceTier) => ({
					...tier,
					additional_currencies: [{ currency: "eur", amount: 0.5 }],
				})),
			},
			index: 1,
			currency: "eur",
			baseCurrency: "usd",
			field: "flat_amount",
			value: "4",
		});
		const savedTier = saveItem(withEur).price.tiers[1];

		expect(savedTier.flat_amount).toBe(0);
		expect(savedTier.additional_currencies).toEqual([
			{ currency: "eur", amount: 0.5, flat_amount: 4 },
		]);
	});
});
