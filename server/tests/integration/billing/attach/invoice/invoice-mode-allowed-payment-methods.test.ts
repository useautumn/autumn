/**
 * Regression coverage for org-level `allowed_payment_methods` on invoice-mode
 * subscriptions (PRD: "Choose payment methods on Autumn invoices").
 *
 * Contract under test:
 *   - `org.config.allowed_payment_methods` is applied as
 *     `payment_settings.payment_method_types` on invoice-mode (send_invoice)
 *     subscription creation.
 *   - The next-cycle (renewal/overage) invoice inherits the list from the
 *     subscription — usage tracked at $0.01/unit lands as a $10 cycle invoice
 *     offering the configured methods.
 *   - Unset config sends no payment_method_types, so Stripe's own account
 *     invoice settings keep applying (no behavior change for existing orgs).
 */

import { expect, test } from "bun:test";
import {
	type InvoicePaymentMethod,
	InvoicePaymentMethodSchema,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";

// USD-compatible subset of the org config enum. Currency-restricted methods
// (sepa_debit, bacs_debit, acss_debit) are left out of the probe.
const CANDIDATE_PAYMENT_METHODS: InvoicePaymentMethod[] = [
	"card",
	"customer_balance",
	"us_bank_account",
	"link",
];

const sorted = (values: string[] | null | undefined) =>
	[...(values ?? [])].sort();

/** Escape hatch for accounts whose payment method configuration under-reports
 *  what invoices accept, e.g. `TEST_INVOICE_PAYMENT_METHODS=card,link`. */
const paymentMethodsOverride = () => {
	const raw = process.env.TEST_INVOICE_PAYMENT_METHODS;
	if (!raw) return undefined;
	const parsed = InvoicePaymentMethodSchema.array()
		.min(1)
		.safeParse(raw.split(",").map((method) => method.trim()));
	if (!parsed.success) {
		throw new Error(
			`TEST_INVOICE_PAYMENT_METHODS is not a valid payment method list: "${raw}"`,
		);
	}
	return parsed.data;
};

/** Stripe rejects a subscription that lists a method the account has not
 *  activated, so assert only on what this account actually offers. */
const resolveActivatedPaymentMethods = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Promise<InvoicePaymentMethod[]> => {
	const override = paymentMethodsOverride();
	if (override) return override;

	try {
		const configurations = await stripeCli.paymentMethodConfigurations.list({
			limit: 10,
		});
		const defaultConfiguration =
			configurations.data.find((configuration) => configuration.is_default) ??
			configurations.data[0];
		const activated = CANDIDATE_PAYMENT_METHODS.filter(
			(method) => defaultConfiguration?.[method]?.available === true,
		);
		return activated.length > 0 ? activated : ["card"];
	} catch {
		return ["card"];
	}
};

const findCycleInvoice = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.Invoice | undefined> => {
	for (let attempt = 0; attempt < 5; attempt++) {
		const invoices = await stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 10,
		});
		const cycleInvoice = invoices.data.find(
			(invoice) => invoice.billing_reason === "subscription_cycle",
		);
		if (cycleInvoice) return cycleInvoice;
		await timeout(10000);
	}
	return undefined;
};

// ═══════════════════════════════════════════════════════════════════
// TEST 1: configured methods reach the sub and its next-cycle invoice
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: cycle invoice inherits the org's allowed list")}`,
	async () => {
		const customerId = "invoice-payment-methods-cycle";
		const usageItem = items.consumable({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.01,
			billingUnits: 1,
		});
		const usagePlan = products.base({
			id: "usage-plan",
			items: [usageItem],
		});

		// The sub-org's own Stripe account decides which methods are configurable,
		// and the org config has to be in place before the attach — so provision
		// it first, probe it, then run the scenario against the same sub-org.
		const subOrgSlug = `invoice-pm-${Math.random().toString(36).slice(2, 8)}`;
		const { ctx: probeCtx } = await initScenario({
			setup: [s.platform.create({ slug: subOrgSlug })],
			actions: [],
		});

		const allowedPaymentMethods = await resolveActivatedPaymentMethods({
			stripeCli: probeCtx.stripeCli,
		});

		if (allowedPaymentMethods.length < 2) {
			console.warn(
				`[invoice-mode-allowed-payment-methods] only "${allowedPaymentMethods.join(", ")}" activated on Stripe account ${probeCtx.org.slug}; asserting on a reduced list`,
			);
		}

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					slug: subOrgSlug,
					configOverrides: { allowed_payment_methods: allowedPaymentMethods },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: true }),
				s.products({ list: [usagePlan] }),
			],
			actions: [
				s.billing.attach({
					productId: usagePlan.id,
					invoice: true,
					enableProductImmediately: true,
					finalizeInvoice: true,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 1000,
					timeout: 3000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const stripeCustomerId = customer!.processor!.id!;
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(sorted(subscription.payment_settings?.payment_method_types)).toEqual(
			sorted(allowedPaymentMethods),
		);

		const cycleInvoice = await findCycleInvoice({
			stripeCli: ctx.stripeCli,
			stripeCustomerId,
		});

		expect(cycleInvoice).toBeDefined();
		// 1000 tracked units × $0.01 = $10.00
		expect(cycleInvoice!.total).toBe(1000);
		expect(
			sorted(cycleInvoice!.payment_settings?.payment_method_types),
		).toEqual(sorted(allowedPaymentMethods));
	},
);

// ═══════════════════════════════════════════════════════════════════
// TEST 2: unset config leaves Stripe's own invoice settings in charge
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-mode payment methods: unset org config sends no payment_method_types")}`,
	async () => {
		const customerId = "invoice-payment-methods-unset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [
				s.billing.attach({
					productId: pro.id,
					invoice: true,
					finalizeInvoice: true,
				}),
			],
		});

		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer!.processor!.id!,
			limit: 1,
		});
		const subscription = subscriptions.data[0];

		expect(subscription).toBeDefined();
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.payment_settings?.payment_method_types).toBeNull();
	},
);
