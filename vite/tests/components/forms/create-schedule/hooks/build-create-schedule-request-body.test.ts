import { describe, expect, test } from "bun:test";
import type { Feature, ProductItem, ProductV2 } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import {
	buildCustomize,
	buildCustomizeBasePrice,
	buildCustomizeItems,
	buildCreateScheduleRequestBody,
} from "@/components/forms/create-schedule/hooks/useCreateScheduleRequestBody";
import { EMPTY_SCHEDULE_PLAN } from "@/components/forms/create-schedule/createScheduleFormSchema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct({
	id = "prod_1",
	items = [],
}: {
	id?: string;
	items?: ProductV2["items"];
} = {}): ProductV2 {
	return {
		id,
		name: "Test Product",
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: AppEnv.Sandbox,
		items,
		created_at: Date.now(),
	};
}

const basePriceItem: ProductItem = {
	feature_id: null,
	price: 2000,
	interval: "month",
	interval_count: 1,
} as ProductItem;

const featurePriceItem: ProductItem = {
	feature_id: "api_calls",
	price: 0.01,
	tiers: null,
	interval: "month",
	interval_count: 1,
	included_usage: 1000,
} as ProductItem;

const featureTieredItem: ProductItem = {
	feature_id: "storage",
	price: null,
	tiers: [
		{ to: 100, amount: 0.5 },
		{ to: -1, amount: 0.25 },
	],
	interval: "month",
	interval_count: 1,
	included_usage: 10,
} as ProductItem;

const freeFeatureItem: ProductItem = {
	feature_id: "support",
	price: null,
	tiers: null,
	included_usage: 1,
} as ProductItem;

const features: Feature[] = [
	{ id: "api_calls", name: "API Calls", internal_id: "int_api", type: "usage" } as Feature,
	{ id: "storage", name: "Storage", internal_id: "int_storage", type: "usage" } as Feature,
	{ id: "support", name: "Support", internal_id: "int_support", type: "boolean" } as Feature,
];

// ---------------------------------------------------------------------------
// buildCustomizeBasePrice
// ---------------------------------------------------------------------------

describe("buildCustomizeBasePrice", () => {
	test("extracts base price from items", () => {
		const result = buildCustomizeBasePrice({ items: [basePriceItem, featurePriceItem] });

		expect(result).toBeDefined();
		expect(result!.amount).toBe(2000);
		expect(result!.interval).toBe("month");
	});

	test("returns undefined when no base price item exists", () => {
		const result = buildCustomizeBasePrice({ items: [featurePriceItem] });

		expect(result).toBeUndefined();
	});

	test("returns undefined when price item has no interval", () => {
		const noIntervalItem = { ...basePriceItem, interval: null } as unknown as ProductItem;
		const result = buildCustomizeBasePrice({ items: [noIntervalItem] });

		expect(result).toBeUndefined();
	});

	test("includes interval_count when present", () => {
		const quarterlyItem = { ...basePriceItem, interval_count: 3 } as ProductItem;
		const result = buildCustomizeBasePrice({ items: [quarterlyItem] });

		expect(result!.interval_count).toBe(3);
	});

	test("omits interval_count when null", () => {
		const item = { ...basePriceItem, interval_count: null } as unknown as ProductItem;
		const result = buildCustomizeBasePrice({ items: [item] });

		expect(result).toBeDefined();
		expect(result!).not.toHaveProperty("interval_count");
	});

	test("ignores feature items that happen to have a price", () => {
		const result = buildCustomizeBasePrice({ items: [featurePriceItem] });

		expect(result).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// buildCustomizeItems
// ---------------------------------------------------------------------------

describe("buildCustomizeItems", () => {
	test("converts priced feature items to plan items", () => {
		const result = buildCustomizeItems({
			items: [featurePriceItem],
			features,
		});

		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].feature_id).toBe("api_calls");
	});

	test("includes tiered feature items", () => {
		const result = buildCustomizeItems({
			items: [featureTieredItem],
			features,
		});

		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].feature_id).toBe("storage");
	});

	test("includes free features (boolean/included-only)", () => {
		const result = buildCustomizeItems({
			items: [freeFeatureItem],
			features,
		});

		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].feature_id).toBe("support");
	});

	test("excludes base price items (no feature_id)", () => {
		const result = buildCustomizeItems({
			items: [basePriceItem],
			features,
		});

		expect(result).toBeUndefined();
	});

	test("strips null max_purchase from output", () => {
		const itemWithNullMax: ProductItem = {
			...featurePriceItem,
			price: 5,
		} as ProductItem;
		const result = buildCustomizeItems({
			items: [itemWithNullMax],
			features,
		});

		expect(result).toBeDefined();
		if (result![0].price) {
			expect(result![0].price.max_purchase).toBeUndefined();
		}
	});

	test("returns items when all feature items are free", () => {
		const result = buildCustomizeItems({
			items: [freeFeatureItem],
			features,
		});

		expect(result).toBeDefined();
		expect(result![0].feature_id).toBe("support");
	});
});

// ---------------------------------------------------------------------------
// buildCustomize
// ---------------------------------------------------------------------------

describe("buildCustomize", () => {
	test("returns undefined for null items", () => {
		const result = buildCustomize({ items: null, features });

		expect(result).toBeUndefined();
	});

	test("returns items when only free features are present", () => {
		const result = buildCustomize({ items: [freeFeatureItem], features });

		expect(result).toBeDefined();
		expect(result!.items).toBeDefined();
	});

	test("returns price when only base price is customized", () => {
		const result = buildCustomize({ items: [basePriceItem], features });

		expect(result).toBeDefined();
		expect(result!.price).toBeDefined();
		expect(result!.price!.amount).toBe(2000);
		expect(result).not.toHaveProperty("items");
	});

	test("returns items when only feature items are customized", () => {
		const result = buildCustomize({ items: [featurePriceItem], features });

		expect(result).toBeDefined();
		expect(result!.items).toBeDefined();
		expect(result).not.toHaveProperty("price");
	});

	test("returns both price and items when fully customized", () => {
		const result = buildCustomize({
			items: [basePriceItem, featurePriceItem],
			features,
		});

		expect(result).toBeDefined();
		expect(result!.price).toBeDefined();
		expect(result!.items).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// buildCreateScheduleRequestBody
// ---------------------------------------------------------------------------

describe("buildCreateScheduleRequestBody", () => {
	const defaultProducts = [makeProduct({ id: "prod_1" })];

	test("returns null when customerId is missing", () => {
		const result = buildCreateScheduleRequestBody({
			customerId: undefined,
			entityId: undefined,
			phases: [{ startsAt: Date.now(), persistedStartsAt: undefined, plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" }] }],
			products: defaultProducts,
			features,
		});

		expect(result).toBeNull();
	});

	test("returns null when phases is empty", () => {
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [],
			products: defaultProducts,
			features,
		});

		expect(result).toBeNull();
	});

	test("builds valid request body for single phase single plan", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" }],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result).not.toBeNull();
		expect(result!.customer_id).toBe("cus_1");
		expect(result!.phases).toHaveLength(1);
		expect(result!.phases[0].plans).toHaveLength(1);
		expect(result!.phases[0].plans[0].plan_id).toBe("prod_1");
	});

	test("includes customize when plan has custom items and isCustom", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [{
						...EMPTY_SCHEDULE_PLAN,
						productId: "prod_1",
						items: [basePriceItem, featurePriceItem],
						isCustom: true,
					}],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result).not.toBeNull();
		const plan = result!.phases[0].plans[0];
		expect(plan.customize).toBeDefined();
		expect(plan.customize!.price).toBeDefined();
		expect(plan.customize!.items).toBeDefined();
	});

	test("omits customize when plan has items but isCustom is false", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [{
						...EMPTY_SCHEDULE_PLAN,
						productId: "prod_1",
						items: [basePriceItem, featurePriceItem],
						isCustom: false,
					}],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result).not.toBeNull();
		const plan = result!.phases[0].plans[0];
		expect(plan.customize).toBeUndefined();
	});

	test("omits customize when plan has no custom items", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" }],
				},
			],
			products: defaultProducts,
			features,
		});

		const plan = result!.phases[0].plans[0];
		expect(plan.customize).toBeUndefined();
	});

	test("skips plans without productId", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [
						{ ...EMPTY_SCHEDULE_PLAN },
						{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" },
					],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result!.phases[0].plans).toHaveLength(1);
		expect(result!.phases[0].plans[0].plan_id).toBe("prod_1");
	});

	test("returns null when phase has null startsAt and is not first without persisted schedule", () => {
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: undefined,
			phases: [
				{
					startsAt: null,
					persistedStartsAt: undefined,
					plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" }],
				},
				{
					startsAt: null,
					persistedStartsAt: undefined,
					plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_2" }],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result).toBeNull();
	});

	test("includes entityId when provided", () => {
		const now = Date.now();
		const result = buildCreateScheduleRequestBody({
			customerId: "cus_1",
			entityId: "entity_1",
			phases: [
				{
					startsAt: now,
					persistedStartsAt: now,
					plans: [{ ...EMPTY_SCHEDULE_PLAN, productId: "prod_1" }],
				},
			],
			products: defaultProducts,
			features,
		});

		expect(result).not.toBeNull();
		expect((result as any).entity_id).toBe("entity_1");
	});
});
