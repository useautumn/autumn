/**
 * Tiered usage prices bill one invoice line per band, sent as quantity × rate,
 * and fall back to the single line wherever that can't hold the total exactly.
 */

import { describe, expect, test } from "bun:test";
import {
	type FullCusEntWithFullCusProduct,
	Infinite,
	type LineItemContext,
	type Price,
	sumValues,
	TierBehavior,
	type UsageTier,
	usagePriceToLineItems,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { addDays, subDays } from "date-fns";

const buildUsageLines = ({
	tiers,
	tierBehavior = TierBehavior.Graduated,
	allowance = 0,
	balance,
	billingUnits = 1,
	featureName = "Messages",
	context: contextOverrides = {},
	options,
}: {
	tiers: UsageTier[];
	tierBehavior?: TierBehavior;
	allowance?: number;
	balance: number;
	billingUnits?: number;
	featureName?: string;
	context?: Partial<LineItemContext>;
	options?: Parameters<typeof usagePriceToLineItems>[0]["options"];
}) => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_messages",
		featureId: "messages",
		featureName,
		allowance,
		balance,
	});
	const base = prices.createConsumable({
		id: "price_messages",
		featureId: "messages",
		entitlementId: "ent_messages",
	});
	const price = {
		...base,
		tier_behavior: tierBehavior,
		config: { ...base.config, usage_tiers: tiers, billing_units: billingUnits },
	} as Price;
	const product = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	const customerProduct = customerProducts.create({
		productId: product.id,
		product,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price })],
	});
	const cusEnt: FullCusEntWithFullCusProduct = {
		...customerEntitlement,
		customer_product: customerProduct,
	};
	const context = {
		price,
		product,
		feature: features.create({ id: "messages", name: featureName }),
		currency: "usd",
		direction: "charge",
		now: Date.now(),
		billingTiming: "in_arrear",
		...contextOverrides,
	} as LineItemContext;

	return usagePriceToLineItems({ cusEnt, context, options });
};

const linesSummary = (lines: ReturnType<typeof buildUsageLines>) =>
	lines.map(({ description, amount, unitPricing }) => ({
		description,
		amount,
		unitPricing,
	}));

const VOLUME_TIERS = [
	{ to: 40, amount: 1 },
	{ to: 140, amount: 0.5 },
	{ to: Infinite, amount: 0.25 },
] as UsageTier[];

const GRADUATED_TIERS = [
	{ to: 100, amount: 1 },
	{ to: 200, amount: 0.8 },
	{ to: Infinite, amount: 0.5 },
] as UsageTier[];

describe("usagePriceToLineItems: volume", () => {
	test("100 included, 150 used: one line, 150 × $0.50 = $75, labelled with the total-usage tier", () => {
		const lines = buildUsageLines({
			tiers: VOLUME_TIERS,
			tierBehavior: TierBehavior.VolumeBased,
			allowance: 100,
			balance: -50,
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 150 @ $0.50 (volume tier 141–240)",
				amount: 75,
				unitPricing: { quantity: 150, unitAmount: 0.5 },
			},
		]);
	});

	test("a tier flat_amount is a separate fee line", () => {
		const lines = buildUsageLines({
			tiers: [
				{ to: 100, amount: 0.4, flat_amount: 5 },
				{ to: Infinite, amount: 0.25, flat_amount: 20 },
			] as UsageTier[],
			tierBehavior: TierBehavior.VolumeBased,
			balance: -300,
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 300 @ $0.25 (volume tier 101+)",
				amount: 75,
				unitPricing: { quantity: 300, unitAmount: 0.25 },
			},
			{
				description: "Pro · Messages — volume tier 101+ flat fee",
				amount: 20,
				unitPricing: { quantity: 1, unitAmount: 20 },
			},
		]);
	});

	test("a flat-fee-only tier bills just the fee line", () => {
		const lines = buildUsageLines({
			tiers: [
				{ to: 500, amount: 0, flat_amount: 10 },
				{ to: Infinite, amount: 0, flat_amount: 25 },
			] as UsageTier[],
			tierBehavior: TierBehavior.VolumeBased,
			allowance: 100,
			balance: -200,
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — volume tier 101–600 flat fee",
				amount: 10,
				unitPricing: { quantity: 1, unitAmount: 10 },
			},
		]);
	});

	test("billing units: quantity is in packs at the pack rate", () => {
		const lines = buildUsageLines({
			tiers: [
				{ to: 500, amount: 5 },
				{ to: Infinite, amount: 3 },
			] as UsageTier[],
			tierBehavior: TierBehavior.VolumeBased,
			balance: -250,
			billingUnits: 100,
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 300 @ $5.00 per 100 (volume tier 1–500)",
				amount: 15,
				unitPricing: { quantity: 3, unitAmount: 5 },
			},
		]);
	});
});

describe("usagePriceToLineItems: graduated", () => {
	test("one line per band, each quantity × that band's rate", () => {
		const lines = buildUsageLines({ tiers: GRADUATED_TIERS, balance: -250 });

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 100 @ $1.00 (tier 1–100)",
				amount: 100,
				unitPricing: { quantity: 100, unitAmount: 1 },
			},
			{
				description: "Pro · Messages — 100 @ $0.80 (tier 101–200)",
				amount: 80,
				unitPricing: { quantity: 100, unitAmount: 0.8 },
			},
			{
				description: "Pro · Messages — 50 @ $0.50 (tier 201+)",
				amount: 25,
				unitPricing: { quantity: 50, unitAmount: 0.5 },
			},
		]);
	});

	test("bands are labelled in total usage when units are included", () => {
		const lines = buildUsageLines({
			tiers: GRADUATED_TIERS,
			allowance: 100,
			balance: -150,
		});

		expect(lines.map((line) => line.description)).toEqual([
			"Pro · Messages — 100 @ $1.00 (tier 101–200)",
			"Pro · Messages — 50 @ $0.80 (tier 201–300)",
		]);
	});

	test("a single-rate price reads as quantity @ rate, with no tier label", () => {
		const lines = buildUsageLines({
			tiers: [{ to: Infinite, amount: 0.5 }] as UsageTier[],
			allowance: 100,
			balance: -50,
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 50 @ $0.50",
				amount: 25,
				unitPricing: { quantity: 50, unitAmount: 0.5 },
			},
		]);
	});

	test("a credit-system feature reads in credits", () => {
		const lines = buildUsageLines({
			tiers: [{ to: Infinite, amount: 0.01 }] as UsageTier[],
			featureName: "Credits",
			balance: -1500,
		});

		expect(lines.map((line) => line.description)).toEqual([
			"Pro · Credits — 1,500 @ $0.01",
		]);
	});

	test("$0 bands are left off", () => {
		const lines = buildUsageLines({
			tiers: [
				{ to: 100, amount: 0 },
				{ to: Infinite, amount: 0.5 },
			] as UsageTier[],
			balance: -150,
		});

		expect(lines.map((line) => line.description)).toEqual([
			"Pro · Messages — 50 @ $0.50 (tier 101+)",
		]);
	});

	test("sub-cent bands round to the cent and the last band absorbs the drift", () => {
		// Each band is 3 × $0.105 = $0.315 → $0.32, but the total $0.63 bills one cent less.
		const lines = buildUsageLines({
			tiers: [
				{ to: 3, amount: 0.105 },
				{ to: Infinite, amount: 0.105 },
			] as UsageTier[],
			balance: -6,
		});

		expect(lines.map((line) => line.amount)).toEqual([0.32, 0.31]);
		expect(sumValues(lines.map((line) => line.amount))).toBe(0.63);
	});
});

describe("usagePriceToLineItems: single-line fallbacks", () => {
	test("within the included amount: one $0 line", () => {
		const lines = buildUsageLines({
			tiers: GRADUATED_TIERS,
			allowance: 100,
			balance: 20,
		});

		expect(lines).toHaveLength(1);
		expect(lines[0].amount).toBe(0);
		expect(lines[0].unitPricing).toBeUndefined();
	});

	test("refunds keep the single line", () => {
		const lines = buildUsageLines({
			tiers: GRADUATED_TIERS,
			balance: -250,
			context: { direction: "refund" },
		});

		expect(lines).toHaveLength(1);
		expect(lines[0].amount).toBe(-205);
		expect(lines[0].unitPricing).toBeUndefined();
	});

	test("prorated lines keep the single line", () => {
		const now = Date.now();
		const lines = buildUsageLines({
			tiers: GRADUATED_TIERS,
			balance: -250,
			context: {
				now,
				billingPeriod: {
					start: subDays(now, 10).getTime(),
					end: addDays(now, 20).getTime(),
				},
			},
			options: { shouldProrateOverride: true },
		});

		expect(lines).toHaveLength(1);
		expect(lines[0].prorated).toBe(true);
		expect(lines[0].unitPricing).toBeUndefined();
	});
});

describe("usagePriceToLineItems: threshold settlement", () => {
	test("a settled chunk describes the units charged, not starting balance + chunk", () => {
		// Threshold billing prices the chunk as a balance of -chargeUnits.
		const lines = buildUsageLines({
			tiers: [{ to: Infinite, amount: 0.5 }] as UsageTier[],
			allowance: 100,
			balance: -50,
			context: { billingTiming: "in_advance" },
			options: {
				shouldProrateOverride: false,
				chargeImmediatelyOverride: true,
			},
		});

		expect(linesSummary(lines)).toEqual([
			{
				description: "Pro · Messages — 50 @ $0.50",
				amount: 25,
				unitPricing: { quantity: 50, unitAmount: 0.5 },
			},
		]);
	});
});
