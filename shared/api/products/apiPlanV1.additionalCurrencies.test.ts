import { describe, expect, test } from "bun:test";
import { ApiPlanV1Schema } from "./apiPlanV1.js";

// The in-file API_PLAN_V1_EXAMPLE uses camelCase keys for docs and does not
// necessarily parse; build minimal valid snake_case fixtures here instead.

const flatFeatureItem = {
	feature_id: "seats",
	included: 0,
	unlimited: false,
	reset: null,
	price: {
		amount: 10,
		interval: "month",
		billing_units: 1,
		billing_method: "prepaid",
		max_purchase: null,
	},
};

const tieredFeatureItem = {
	feature_id: "messages",
	included: 100,
	unlimited: false,
	reset: { interval: "month" },
	price: {
		interval: "month",
		billing_units: 100,
		billing_method: "usage_based",
		max_purchase: null,
		tier_behavior: "graduated",
		tiers: [
			{ to: 1000, amount: 0.5 },
			{ to: "inf", amount: 0.3 },
		],
	},
};

// biome-ignore lint/suspicious/noExplicitAny: test fixture builder
const makePlan = (overrides: Record<string, any> = {}) => ({
	id: "pro",
	name: "Pro Plan",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: { amount: 10, interval: "month" },
	items: [] as unknown[],
	created_at: 1771513979217,
	env: "sandbox",
	archived: false,
	base_variant_id: null,
	config: {},
	metadata: {},
	...overrides,
});

describe("ApiPlanV1 additional_currencies", () => {
	test("preserves additional_currencies on the base price", () => {
		const plan = makePlan({
			price: {
				amount: 10,
				interval: "month",
				additional_currencies: [{ currency: "eur", amount: 9 }],
			},
		});

		const parsed = ApiPlanV1Schema.parse(plan);

		expect(parsed.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});

	test("preserves additional_currencies on a flat feature price", () => {
		const item = {
			...flatFeatureItem,
			price: {
				...flatFeatureItem.price,
				additional_currencies: [{ currency: "eur", amount: 9 }],
			},
		};

		const parsed = ApiPlanV1Schema.parse(makePlan({ items: [item] }));

		expect(parsed.items[0].price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});

	test("preserves per-tier additional_currencies on a tiered feature price", () => {
		const item = {
			...tieredFeatureItem,
			price: {
				...tieredFeatureItem.price,
				tiers: [
					{
						to: 1000,
						amount: 0.5,
						additional_currencies: [{ currency: "eur", amount: 0.4 }],
					},
					{
						to: "inf",
						amount: 0.3,
						additional_currencies: [{ currency: "eur", amount: 0.25 }],
					},
				],
			},
		};

		const parsed = ApiPlanV1Schema.parse(makePlan({ items: [item] }));
		const tiers = parsed.items[0].price?.tiers;

		expect(tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
		expect(tiers?.[1].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);
	});

	test("parses a plan with no additional_currencies (backward compatible)", () => {
		const parsed = ApiPlanV1Schema.parse(
			makePlan({ items: [flatFeatureItem, tieredFeatureItem] }),
		);

		expect(parsed.price?.additional_currencies).toBeUndefined();
		expect(parsed.items[0].price?.additional_currencies).toBeUndefined();
	});

	test("rejects a currency present on some tiers but not all", () => {
		const item = {
			...tieredFeatureItem,
			price: {
				...tieredFeatureItem.price,
				tiers: [
					{
						to: 1000,
						amount: 0.5,
						additional_currencies: [{ currency: "eur", amount: 0.4 }],
					},
					// second tier is missing the eur currency
					{ to: "inf", amount: 0.3 },
				],
			},
		};

		expect(() => ApiPlanV1Schema.parse(makePlan({ items: [item] }))).toThrow();
	});

	test("preserves flat-only additional currencies on a volume tier", () => {
		const item = {
			...tieredFeatureItem,
			price: {
				...tieredFeatureItem.price,
				tier_behavior: "volume",
				tiers: [
					{
						to: "inf",
						flat_amount: 20,
						additional_currencies: [{ currency: "eur", flat_amount: 18 }],
					},
				],
			},
		};

		const parsed = ApiPlanV1Schema.parse(makePlan({ items: [item] }));

		expect(parsed.items[0].price?.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", flat_amount: 18 },
		]);
	});

	test("rejects duplicate currencies within one list", () => {
		const item = {
			...flatFeatureItem,
			price: {
				...flatFeatureItem.price,
				additional_currencies: [
					{ currency: "eur", amount: 9 },
					{ currency: "EUR", amount: 8 },
				],
			},
		};

		expect(() => ApiPlanV1Schema.parse(makePlan({ items: [item] }))).toThrow();
	});

	test("rejects price.additional_currencies without a flat amount", () => {
		const item = {
			...tieredFeatureItem,
			price: {
				...tieredFeatureItem.price,
				additional_currencies: [{ currency: "eur", amount: 9 }],
			},
		};

		expect(() => ApiPlanV1Schema.parse(makePlan({ items: [item] }))).toThrow();
	});

	test("rejects a currency entry with neither amount nor flat_amount", () => {
		const item = {
			...tieredFeatureItem,
			price: {
				...tieredFeatureItem.price,
				tiers: [
					{
						to: 1000,
						amount: 0.5,
						additional_currencies: [{ currency: "eur" }],
					},
					{
						to: "inf",
						amount: 0.3,
						additional_currencies: [{ currency: "eur" }],
					},
				],
			},
		};

		expect(() => ApiPlanV1Schema.parse(makePlan({ items: [item] }))).toThrow();
	});
});
