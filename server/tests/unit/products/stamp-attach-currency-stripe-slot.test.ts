/**
 * stampAttachCurrencyStripeSlot
 *
 * Full usage reuse must persist stripe_product_id (+ meter for consumable)
 * with the Price slot. createStripePriceIFNotExist sees an empty product
 * slot and mints a new feature Product while the borrowed Price stays
 * on the donor.
 *
 * Red (current):  stamp copies stripe_price_id + meter, not stripe_product_id
 * Green (after):  same persist writes the donor feature Product id
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockState = {
	persistCalls: 0,
};

await mockModuleWithRestore(
	"@/internal/products/prices/PriceService.js",
	() => ({
		PriceService: {
			update: async () => {
				mockState.persistCalls += 1;
			},
		},
	}),
);

const { stampAttachCurrencyStripeSlot } = await import(
	"@/internal/products/stripeResourceUtils/findReusableStripeResources/stampAttachCurrencyStripeSlot.js"
);

const ctx = {
	db: {},
	env: AppEnv.Sandbox,
	org: { id: "org_1", default_currency: "usd" },
} as unknown as AutumnContext;

const consumable = ({
	id,
	stripePriceId,
	stripeProductId,
	stripeMeterId,
	stripeEventName,
}: {
	id: string;
	stripePriceId?: string;
	stripeProductId?: string;
	stripeMeterId?: string;
	stripeEventName?: string;
}): Price => ({
	id,
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "ifeat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount: 2, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		should_prorate: false,
		...(stripePriceId ? { stripe_price_id: stripePriceId } : {}),
		...(stripeProductId ? { stripe_product_id: stripeProductId } : {}),
		...(stripeMeterId ? { stripe_meter_id: stripeMeterId } : {}),
		...(stripeEventName ? { stripe_event_name: stripeEventName } : {}),
	} satisfies UsagePriceConfig,
	proration_config: null,
});

const fixed = ({
	id,
	stripePriceId,
	stripeProductId,
}: {
	id: string;
	stripePriceId?: string;
	stripeProductId?: string;
}): Price => ({
	id,
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Fixed,
		amount: 25,
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: stripePriceId ?? null,
		stripe_product_id: stripeProductId ?? null,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

describe("stampAttachCurrencyStripeSlot", () => {
	beforeEach(() => {
		mockState.persistCalls = 0;
	});

	test("consumable full reuse copies Price slot, feature Product, and meter in one persist", async () => {
		const target = consumable({ id: "pr_b" });
		const source = consumable({
			id: "pr_a",
			stripePriceId: "price_a",
			stripeProductId: "prod_feat_a",
			stripeMeterId: "mtr_a",
			stripeEventName: "messages_used",
		});

		await stampAttachCurrencyStripeSlot({
			ctx,
			targetPrice: target,
			sourcePrice: source,
			currency: "usd",
			slot: "stripe_price_id",
		});

		const config = target.config as UsagePriceConfig;
		expect(config.stripe_price_id).toBe("price_a");
		expect(config.stripe_product_id).toBe("prod_feat_a");
		expect(config.stripe_meter_id).toBe("mtr_a");
		expect(config.stripe_event_name).toBe("messages_used");
		expect(mockState.persistCalls).toBe(1);
	});

	test("fixed reuse copies the Price slot only", async () => {
		const target = fixed({ id: "pr_b" });
		const source = fixed({
			id: "pr_a",
			stripePriceId: "price_a",
			stripeProductId: "prod_plan_a",
		});

		await stampAttachCurrencyStripeSlot({
			ctx,
			targetPrice: target,
			sourcePrice: source,
			currency: "usd",
			slot: "stripe_price_id",
		});

		expect(target.config.stripe_price_id).toBe("price_a");
		expect(target.config.stripe_product_id).toBeNull();
		expect(
			(target.config as { stripe_meter_id?: string }).stripe_meter_id,
		).toBeUndefined();
		expect(mockState.persistCalls).toBe(1);
	});

	test("filled slot does not persist or overwrite a missing meter", async () => {
		const target = consumable({
			id: "pr_b",
			stripePriceId: "price_already",
		});
		const source = consumable({
			id: "pr_a",
			stripePriceId: "price_a",
			stripeMeterId: "mtr_a",
			stripeEventName: "messages_used",
		});

		await stampAttachCurrencyStripeSlot({
			ctx,
			targetPrice: target,
			sourcePrice: source,
			currency: "usd",
			slot: "stripe_price_id",
		});

		const config = target.config as UsagePriceConfig;
		expect(config.stripe_price_id).toBe("price_already");
		expect(config.stripe_meter_id).toBeUndefined();
		expect(mockState.persistCalls).toBe(0);
	});
});

afterAll(() => {
	mock.restore();
});
