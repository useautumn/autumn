import { describe, expect, test } from "bun:test";
import {
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	OnDecrease,
	OnIncrease,
	type Price,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleProratedDowngrade } from "@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedDowngrade.js";

const INCLUDED = 3;
const TIERS = [
	{ to: 5, amount: 10 },
	{ to: "inf", amount: 6, flat_amount: 2 },
] as UsageTier[];

const DAY_SECONDS = 24 * 60 * 60;

const decreaseSetup = ({
	onDecrease = OnDecrease.ProrateImmediately,
	tiers = TIERS,
	billingUnits = 1,
}: {
	onDecrease?: OnDecrease;
	tiers?: UsageTier[];
	billingUnits?: number;
} = {}) => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_users",
		featureId: "users",
		featureName: "Users",
		allowance: INCLUDED,
		balance: INCLUDED - 9,
	});
	customerEntitlement.entitlement.feature = features.create({
		id: "users",
		name: "Users",
	});
	const base = prices.createAllocated({
		id: "price_users",
		featureId: "users",
		entitlementId: "ent_users",
	});
	const price = {
		...base,
		tier_behavior: TierBehavior.VolumeBased,
		config: { ...base.config, usage_tiers: tiers, billing_units: billingUnits },
		proration_config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: onDecrease,
		},
	} as Price;
	const product = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	const cusPrice = prices.createCustomer({ price }) as FullCustomerPrice;
	const customerProduct = customerProducts.create({
		productId: product.id,
		product,
		customerEntitlements: [customerEntitlement],
		customerPrices: [cusPrice],
	});
	const cusEnt: FullCusEntWithFullCusProduct = {
		...customerEntitlement,
		customer_product: customerProduct,
	};

	const calls = {
		invoiceItems: [] as Stripe.InvoiceItemCreateParams[],
		payments: [] as { invoiceId: string; paymentMethod?: string }[],
		invoicesCreated: 0,
		quantities: [] as number[],
	};
	let invoiceStatus: Stripe.Invoice.Status = "draft";
	const invoice = () => ({ id: "in_1", status: invoiceStatus, total: 1200 });
	const stripeCli = {
		customers: {
			retrieve: async () => ({
				id: "cus_1",
				invoice_settings: { default_payment_method: "pm_default" },
			}),
		},
		paymentMethods: {
			retrieve: async (id: string) => ({ id }),
			list: async () => ({ data: [] }),
		},
		invoiceItems: {
			create: async (params: Stripe.InvoiceItemCreateParams) => {
				calls.invoiceItems.push(params);
				return {};
			},
		},
		invoices: {
			create: async () => {
				calls.invoicesCreated += 1;
				return invoice();
			},
			finalizeInvoice: async () => {
				invoiceStatus = "open";
				return invoice();
			},
			retrieve: async () => invoice(),
			pay: async (invoiceId: string, params: { payment_method?: string }) => {
				calls.payments.push({
					invoiceId,
					paymentMethod: params.payment_method,
				});
				invoiceStatus = "paid";
				return invoice();
			},
			voidInvoice: async () => invoice(),
		},
		subscriptionItems: {
			update: async (_id: string, params: { quantity: number }) => {
				calls.quantities.push(params.quantity);
				return {};
			},
		},
	} as unknown as Stripe;

	const nowSeconds = Math.floor(Date.now() / 1000);
	const ctx = {
		logger: { info: () => {}, warn: () => {}, error: () => {} },
		org: { default_currency: "usd" },
	} as unknown as AutumnContext;
	const sub = {
		id: "sub_1",
		status: "active",
		livemode: true,
		customer: "cus_1",
	} as Stripe.Subscription;
	const subItem = {
		id: "si_1",
		current_period_start: nowSeconds,
		current_period_end: nowSeconds + 30 * DAY_SECONDS,
	} as Stripe.SubscriptionItem;

	return { cusEnt, cusPrice, stripeCli, ctx, sub, subItem, calls };
};

describe("volume seat decrease that raises the bill", () => {
	test("9 → 8 seats charges $12 with the default payment method; Stripe goes to 5", async () => {
		const setup = decreaseSetup();
		await handleProratedDowngrade({
			...setup,
			prevBalance: INCLUDED - 9,
			newBalance: INCLUDED - 8,
		});

		expect(setup.calls.invoiceItems[0]?.price_data?.unit_amount).toBe(1200);
		expect(setup.calls.payments).toEqual([
			{ invoiceId: "in_1", paymentMethod: "pm_default" },
		]);
		expect(setup.calls.quantities).toEqual([5]);
	});

	test("the proration line names the seats over included at their volume tier", async () => {
		const setup = decreaseSetup();
		await handleProratedDowngrade({
			...setup,
			prevBalance: INCLUDED - 9,
			newBalance: INCLUDED - 8,
		});

		expect(setup.calls.invoiceItems[0]?.description).toStartWith(
			"Pro - Users: 5 @ $10.00 (volume tier 4–8)",
		);
	});

	test("a decrease back to included keeps the volume line format", async () => {
		const setup = decreaseSetup();
		await handleProratedDowngrade({
			...setup,
			prevBalance: INCLUDED - 4,
			newBalance: 0,
		});

		expect(setup.calls.invoiceItems[0]?.description).toStartWith(
			"Pro - Users: 0 @ $0.00 (volume tier 1–3)",
		);
	});

	test("with packs of 5, the line names the packed seats over included, not the re-rounded total", async () => {
		const setup = decreaseSetup({
			tiers: [
				{ to: 20, amount: 50 },
				{ to: "inf", amount: 40 },
			] as UsageTier[],
			billingUnits: 5,
		});
		await handleProratedDowngrade({
			...setup,
			prevBalance: INCLUDED - 11,
			newBalance: INCLUDED - 6,
		});

		expect(setup.calls.invoiceItems[0]?.description).toStartWith(
			"Pro - Users: 5 @ $50.00 per 5 (volume tier 4–23)",
		);
	});
});
