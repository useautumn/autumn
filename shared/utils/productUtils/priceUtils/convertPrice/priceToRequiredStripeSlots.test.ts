import { describe, expect, test } from "bun:test";
import { BillingVersion } from "@models/billingModels/context/billingContext";
import { AppEnv } from "@models/genModels/genEnums";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { BillWhen } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { PriceType } from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import { priceToRequiredStripeSlots } from "./priceToRequiredStripeSlots";

const product = (overrides: Partial<FullProduct> = {}): FullProduct =>
	({
		id: "plan",
		name: "Plan",
		internal_id: "prod_internal",
		env: AppEnv.Sandbox,
		prices: [],
		entitlements: [],
		...overrides,
	}) as FullProduct;

const fixedPrice = ({ amount = 10 }: { amount?: number } = {}): Price =>
	({
		id: "price_fixed",
		config: {
			type: PriceType.Fixed,
			amount,
			interval: BillingInterval.Month,
		},
	}) as Price;

const prepaidPrice = (): Price =>
	({
		id: "price_prepaid",
		entitlement_id: "ent_1",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 1,
			feature_id: "messages",
			internal_feature_id: "feature_internal",
			usage_tiers: [{ amount: 10, to: -1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
		},
	}) as Price;

const consumablePrice = (): Price =>
	({
		id: "price_consumable",
		entitlement_id: "ent_1",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: false,
			billing_units: 1,
			feature_id: "messages",
			internal_feature_id: "feature_internal",
			usage_tiers: [{ amount: 1, to: -1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
		},
	}) as Price;

const allocatedPrice = (): Price =>
	({
		id: "price_allocated",
		entitlement_id: "ent_1",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: true,
			billing_units: 1,
			feature_id: "seats",
			internal_feature_id: "feature_internal",
			usage_tiers: [{ amount: 10, to: -1 }],
			interval: BillingInterval.Month,
			interval_count: 1,
		},
	}) as Price;

const oneOffTieredPrepaid = (): Price =>
	({
		id: "price_one_off_tiered",
		entitlement_id: "ent_1",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 1,
			feature_id: "messages",
			internal_feature_id: "feature_internal",
			usage_tiers: [
				{ amount: 10, to: 100 },
				{ amount: 5, to: -1 },
			],
			interval: BillingInterval.OneOff,
		},
	}) as Price;

describe("priceToRequiredStripeSlots", () => {
	test("zero fixed price requires nothing", () => {
		expect(
			priceToRequiredStripeSlots({
				price: fixedPrice({ amount: 0 }),
				product: product(),
			}),
		).toEqual([]);
	});

	test("fixed price requires stripe_price_id", () => {
		expect(
			priceToRequiredStripeSlots({
				price: fixedPrice(),
				product: product(),
			}),
		).toEqual(["stripe_price_id"]);
	});

	test("V2 prepaid requires v2 id + product, not v1 stripe_price_id", () => {
		expect(
			priceToRequiredStripeSlots({
				price: prepaidPrice(),
				product: product(),
				billingVersion: BillingVersion.V2,
			}),
		).toEqual(["stripe_prepaid_price_v2_id", "stripe_product_id"]);
	});

	test("V1 prepaid requires v1 stripe_price_id + product", () => {
		expect(
			priceToRequiredStripeSlots({
				price: prepaidPrice(),
				product: product(),
				billingVersion: BillingVersion.V1,
			}),
		).toEqual(["stripe_price_id", "stripe_product_id"]);
	});

	test("defaults to V2 slots", () => {
		expect(
			priceToRequiredStripeSlots({
				price: prepaidPrice(),
				product: product(),
			}),
		).toEqual(["stripe_prepaid_price_v2_id", "stripe_product_id"]);
	});

	test("V2 allocated requires stripe_price_id + product, not placeholder", () => {
		expect(
			priceToRequiredStripeSlots({
				price: allocatedPrice(),
				product: product(),
				billingVersion: BillingVersion.V2,
			}),
		).toEqual(["stripe_price_id", "stripe_product_id"]);
	});

	test("V1 allocated still requires placeholder + meter", () => {
		expect(
			priceToRequiredStripeSlots({
				price: allocatedPrice(),
				product: product(),
				billingVersion: BillingVersion.V1,
			}),
		).toEqual([
			"stripe_price_id",
			"stripe_product_id",
			"stripe_meter_id",
			"stripe_placeholder_price_id",
		]);
	});

	test("consumable requires price + product + meter on V2", () => {
		expect(
			priceToRequiredStripeSlots({
				price: consumablePrice(),
				product: product(),
				billingVersion: BillingVersion.V2,
			}),
		).toEqual(["stripe_price_id", "stripe_product_id", "stripe_meter_id"]);
	});

	test("never requires stripe_empty_price_id", () => {
		const slots = [
			...priceToRequiredStripeSlots({
				price: consumablePrice(),
				product: product(),
				billingVersion: BillingVersion.V1,
			}),
			...priceToRequiredStripeSlots({
				price: consumablePrice(),
				product: product(),
				billingVersion: BillingVersion.V2,
			}),
		];
		expect(slots).not.toContain("stripe_empty_price_id");
	});

	test("one-off tiered prepaid requires only stripe_product_id", () => {
		expect(
			priceToRequiredStripeSlots({
				price: oneOffTieredPrepaid(),
				product: product(),
			}),
		).toEqual(["stripe_product_id"]);
	});
});
