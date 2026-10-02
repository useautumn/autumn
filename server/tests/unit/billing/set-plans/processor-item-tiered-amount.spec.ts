import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type Entitlement,
	type Organization,
	type Price,
	PriceType,
	TierBehavior,
} from "@autumn/shared";
import type Stripe from "stripe";
import { autumnPriceToProcessorItemPrice } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/price/autumnPriceToProcessorItemPrice";
import { processorItemAmount } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/price/processorItemAmount";
import { toProcessorItem } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/toProcessorItem";
import type { ProcessorItemContext } from "@/internal/billing/v2/actions/setPlans/preview/processorItems/types/processorItemContext";

const org = { default_currency: "usd" } as Organization;

const tieredStripePrice = ({
	tiersMode,
	tiers,
}: {
	tiersMode: "volume" | "graduated";
	tiers: Partial<Stripe.Price.Tier>[];
}) =>
	({
		id: "price_credits",
		currency: "usd",
		billing_scheme: "tiered",
		tiers_mode: tiersMode,
		tiers,
		recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
		transform_quantity: null,
	}) as unknown as Stripe.Price;

const itemAmount = ({
	stripePrice,
	quantity,
}: {
	stripePrice: Stripe.Price;
	quantity: number;
}) => {
	const context: ProcessorItemContext = {
		priceIndex: { byAutumnPriceId: new Map(), byStripePriceId: new Map() },
		stripePrices: new Map([[stripePrice.id, stripePrice]]),
		currency: "usd",
		org,
	};
	return toProcessorItem({ stripePriceId: stripePrice.id, quantity, context })
		.amount;
};

describe("tiered processor item amounts", () => {
	test("a volume price charges the whole quantity at the tier it lands in", () => {
		const stripePrice = tieredStripePrice({
			tiersMode: "volume",
			tiers: [
				{ up_to: 100_000, unit_amount_decimal: "1" },
				{ up_to: null, unit_amount_decimal: "0.8" },
			],
		});

		expect(itemAmount({ stripePrice, quantity: 240_000 })).toBe(1920);
		expect(itemAmount({ stripePrice, quantity: 50_000 })).toBe(500);
	});

	test("a graduated price charges each band at its rate plus each reached tier's flat fee", () => {
		const stripePrice = tieredStripePrice({
			tiersMode: "graduated",
			tiers: [
				{ up_to: 100, unit_amount: 1000 },
				{ up_to: null, unit_amount: 500, flat_amount: 2000 },
			],
		});

		expect(itemAmount({ stripePrice, quantity: 150 })).toBe(1270);
		expect(itemAmount({ stripePrice, quantity: 80 })).toBe(800);
	});

	test("a prepaid price not yet in Stripe prices its packs like the Stripe price Autumn will create", () => {
		const price = {
			id: "pr_credits",
			entitlement_id: "ent_credits",
			tier_behavior: TierBehavior.Graduated,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.InAdvance,
				interval: BillingInterval.Month,
				billing_units: 100,
				usage_tiers: [
					{ to: 1000, amount: 5 },
					{ to: "inf", amount: 4 },
				],
				feature_id: "credits",
			},
		} as unknown as Price;
		const entitlement = {
			id: "ent_credits",
			allowance: 200,
		} as unknown as Entitlement;

		const processorItemPrice = autumnPriceToProcessorItemPrice({
			price,
			entitlement,
			org,
			currency: "usd",
		});

		expect(processorItemPrice.tiers).toEqual([
			{ up_to: 2, unit_amount: 0, flat_amount: 0 },
			{ up_to: 12, unit_amount: 5, flat_amount: 0 },
			{ up_to: null, unit_amount: 4, flat_amount: 0 },
		]);
		expect(
			processorItemAmount({ price: processorItemPrice, quantity: 12 }),
		).toBe(50);
	});

	test("a metered tiered price still varies with usage", () => {
		const stripePrice = tieredStripePrice({
			tiersMode: "volume",
			tiers: [{ up_to: null, unit_amount_decimal: "1" }],
		});
		stripePrice.recurring = {
			...stripePrice.recurring,
			usage_type: "metered",
		} as Stripe.Price.Recurring;

		expect(itemAmount({ stripePrice, quantity: 10 })).toBeNull();
	});
});
