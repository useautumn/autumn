import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type EntitlementWithFeature,
	type Organization,
	type Price,
	PriceType,
	type Product,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";

await mockModuleWithRestore(
	"@server/internal/products/prices/PriceService",
	() => ({
		PriceService: { update: async () => undefined },
	}),
);

import { createStripeArrearProrated } from "@/external/stripe/createStripePrice/createStripeArrearProrated";
import { createStripeInArrearPrice } from "@/external/stripe/createStripePrice/createStripeInArrear";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Stored tiers are net of the 3 included seats: public bands 4–8 @ $10
// (flat $5) and 9+ @ $6 (flat $2) store as 0–5 and 5+.
const NET_TIERS: UsageTier[] = [
	{ to: 5, amount: 10, flat_amount: 5 },
	{ to: -1, amount: 6, flat_amount: 2 },
];
const INCLUDED = 3;

const allocatedPrice = ({
	tierBehavior,
	tiers = NET_TIERS,
	billingUnits = 1,
}: {
	tierBehavior: TierBehavior | null;
	tiers?: UsageTier[];
	billingUnits?: number;
}): Price =>
	({
		id: "price_allocated",
		internal_product_id: "prod_internal",
		org_id: "org_1",
		created_at: 1,
		tier_behavior: tierBehavior,
		is_custom: false,
		entitlement_id: "ent_1",
		proration_config: null,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			should_prorate: true,
			billing_units: billingUnits,
			internal_feature_id: "feature_internal",
			feature_id: "seats",
			usage_tiers: tiers,
			interval: BillingInterval.Month,
			interval_count: 1,
			stripe_price_id: null,
			stripe_product_id: null,
		},
	}) as unknown as Price;

const entitlement = {
	id: "ent_1",
	internal_product_id: "prod_internal",
	internal_feature_id: "feature_internal",
	allowance: INCLUDED,
	feature: { id: "seats", name: "Seats" },
} as unknown as EntitlementWithFeature;

const org = { default_currency: "usd" } as unknown as Organization;
const product = {
	name: "Pro",
	processor: { id: "prod_shared" },
} as unknown as Product;

const createStripePrices = async ({ price }: { price: Price }) => {
	const priceCreates: Record<string, unknown>[] = [];
	const stripeCli = {
		prices: {
			create: async (params: Record<string, unknown>) => {
				priceCreates.push(params);
				return { id: `price_${priceCreates.length}`, product: "prod_shared" };
			},
		},
		billing: {
			meters: {
				list: async () => ({ data: [], has_more: false }),
				create: async () => ({ id: "meter_1" }),
			},
		},
	};

	await createStripeArrearProrated({
		db: {} as never,
		stripeCli: stripeCli as never,
		price,
		product,
		org,
		entitlements: [entitlement],
		curStripeProd: { id: "prod_shared" } as never,
	});

	return { seatPrice: priceCreates[0], placeholderPrice: priceCreates[1] };
};

describe("allocated Stripe price tiers", () => {
	test("volume: tiers_mode volume, free tier for included seats, bands shifted by included", async () => {
		const { seatPrice, placeholderPrice } = await createStripePrices({
			price: allocatedPrice({ tierBehavior: TierBehavior.VolumeBased }),
		});

		expect(seatPrice.tiers_mode).toBe("volume");
		expect(seatPrice.tiers).toEqual([
			{ unit_amount_decimal: "0", up_to: INCLUDED },
			{
				up_to: 5 + INCLUDED,
				unit_amount_decimal: "1000",
				flat_amount_decimal: "500",
			},
			{ up_to: "inf", unit_amount_decimal: "600", flat_amount_decimal: "200" },
		]);
		// The metered placeholder never receives usage, so it carries no flat fees
		// (Stripe would bill tier 1's at quantity 0 every cycle).
		expect(placeholderPrice.tiers_mode).toBe("volume");
		expect(placeholderPrice.tiers).toEqual([
			{ unit_amount_decimal: "0", up_to: INCLUDED },
			{ up_to: 5 + INCLUDED, unit_amount_decimal: "1000" },
			{ up_to: "inf", unit_amount_decimal: "600" },
		]);
	});

	test("volume with billing units: unit amount per seat, bands in seats", async () => {
		const { seatPrice } = await createStripePrices({
			price: allocatedPrice({
				tierBehavior: TierBehavior.VolumeBased,
				billingUnits: 5,
				tiers: [
					{ to: 10, amount: 50 },
					{ to: -1, amount: 25 },
				],
			}),
		});

		expect(seatPrice.tiers).toEqual([
			{ unit_amount_decimal: "0", up_to: INCLUDED },
			{ up_to: 10 + INCLUDED, unit_amount_decimal: "1000" },
			{ up_to: "inf", unit_amount_decimal: "500" },
		]);
	});

	test("graduated: tiers_mode graduated on the same tiers", async () => {
		const { seatPrice } = await createStripePrices({
			price: allocatedPrice({
				tierBehavior: null,
				tiers: [
					{ to: 5, amount: 10 },
					{ to: -1, amount: 6 },
				],
			}),
		});

		expect(seatPrice.tiers_mode).toBe("graduated");
		expect(seatPrice.tiers).toEqual([
			{ unit_amount_decimal: "0", up_to: INCLUDED },
			{ up_to: 5 + INCLUDED, unit_amount_decimal: "1000" },
			{ up_to: "inf", unit_amount_decimal: "600" },
		]);
	});

	test("pay-per-use metered price: volume, no flat fees, so an unbilled quantity of 0 costs $0", async () => {
		const priceCreates: Record<string, unknown>[] = [];
		const stripeCli = {
			prices: {
				create: async (params: Record<string, unknown>) => {
					priceCreates.push(params);
					return { id: "price_metered", product: "prod_shared" };
				},
			},
			billing: {
				meters: {
					list: async () => ({ data: [], has_more: false }),
					create: async () => ({ id: "meter_1", event_name: "evt" }),
				},
			},
		};

		await createStripeInArrearPrice({
			db: {} as never,
			stripeCli: stripeCli as never,
			product,
			price: allocatedPrice({ tierBehavior: TierBehavior.VolumeBased }),
			entitlements: [{ ...entitlement, allowance: 0 }],
			org,
			logger: { info: () => undefined, error: () => undefined },
			curStripePrice: null,
			curStripeProduct: { id: "prod_shared" } as never,
		});

		expect(priceCreates[0].tiers_mode).toBe("volume");
		expect(priceCreates[0].tiers).toEqual([
			{ up_to: 5, unit_amount_decimal: "1000" },
			{ up_to: "inf", unit_amount_decimal: "600" },
		]);
	});
});
