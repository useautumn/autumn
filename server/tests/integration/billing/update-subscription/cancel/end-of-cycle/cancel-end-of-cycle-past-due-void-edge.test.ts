// Edge/adversarial coverage for void-on-cancel of past_due customers (companion to the PRIMARY +
// control cases): no unpaid-cycle credit across entry points, no shared-sub collateral void,
// void-correctness. Cases mutate shared org.config -> serial via withVoidFlag.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { OrgService } from "@/internal/orgs/OrgService";
import { timeout } from "@/utils/genUtils";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const withVoidFlag = async ({
	ctx,
	enabled,
	fn,
}: {
	ctx: ScenarioCtx;
	enabled: boolean;
	fn: () => Promise<void>;
}): Promise<void> => {
	const originalConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: enabled,
			},
		},
	});
	try {
		await fn();
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalConfig },
		});
	}
};

// A past_due cancel must never credit the customer for the cycle they never paid:
// no negative-total invoice anywhere, and a zero Stripe customer balance.
const expectNoCredit = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: ScenarioCtx;
	stripeCustomerId: string | undefined;
}): Promise<void> => {
	const allInvoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
	});
	expect(allInvoices.data.filter((inv) => (inv.total ?? 0) < 0).length).toBe(0);
	const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
		stripeCustomerId!,
	)) as Stripe.Customer;
	expect(stripeCustomer.balance).toBe(0);
};

const expectInvoicesVoided = async ({
	ctx,
	stripeCustomerId,
	subscriptionId,
}: {
	ctx: ScenarioCtx;
	stripeCustomerId: string | undefined;
	subscriptionId: string;
}): Promise<void> => {
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
		subscription: subscriptionId,
	});
	expect(invoices.data.filter((inv) => inv.status === "open").length).toBe(0);
	expect(
		invoices.data.filter((inv) => inv.status === "void").length,
	).toBeGreaterThan(0);
};

const buildProductSet = () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	return { free, pro };
};

// ═══════════════════════════════════════════════════════════════════════════════
// #1 (no-credit): the proration suppression must hold across every entry point/input
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: billing.update past_due + explicit proration_behavior=prorate_immediately -> immediate, void, NO credit")}`, async () => {
	const customerId = "qa-eoc-prorate-override";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			// Caller explicitly asks to prorate — the past_due resolution must still force "none".
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				proration_behavior: "prorate_immediately",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectNoStripeSubscription({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});

test(`${chalk.yellowBright("edge: /billing/cancel past_due + prorate=true -> immediate, void, NO credit")}`, async () => {
	const customerId = "qa-cancel-endpoint-prorate";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			// Legacy /billing/cancel hardcodes proration_behavior="prorate_immediately".
			await autumnV1.cancel({
				customer_id: customerId,
				product_id: pro.id,
				cancel_immediately: false,
				prorate: true,
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectNoStripeSubscription({
				db: ctx.db,
				customerId,
				org: ctx.org,
				env: ctx.env,
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});

test(`${chalk.yellowBright("edge: explicit cancel_immediately on past_due -> immediate, void, NO credit")}`, async () => {
	const customerId = "qa-explicit-immediate";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});

test(`${chalk.yellowBright("edge: refund_last_payment=full on unpaid past_due -> NO credit")}`, async () => {
	const customerId = "qa-refund-last-payment";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			// refund_last_payment requires cancel_immediately. The unpaid cycle has no collected
			// payment to refund, so this must still net no credit.
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				refund_last_payment: "full",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
			await expectInvoicesVoided({ ctx, stripeCustomerId, subscriptionId });
			await expectNoCredit({ ctx, stripeCustomerId });
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// #2 (shared-sub collateral): only void when the WHOLE subscription is cancelled
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: shared sub - cancelling past_due main does NOT void surviving add-on's invoice")}`, async () => {
	const customerId = "qa-shared-sub-addon";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const addon = products.recurringAddOn({ id: "addon", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({
				list: [free, pro, addon],
				customerIdsToDelete: [customerId],
			}),
		],
		// Add-on attaches onto the SAME Stripe subscription as pro (no new_billing_subscription).
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const customerBefore =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			const stripeCustomerId = customerBefore.stripe_id;
			// Precondition: a single shared Stripe subscription carrying both products' items.
			const subs = await ctx.stripeCli.subscriptions.list({
				customer: stripeCustomerId!,
			});
			expect(subs.data.length).toBe(1);
			expect(subs.data[0].items.data.length).toBeGreaterThanOrEqual(2);
			const subscriptionId = subs.data[0].id;

			// Force ONLY the main product past_due; the add-on stays on the live subscription.
			await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});

			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			await timeout(3000);

			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			// Main gone; add-on survives -> the Stripe op was an "update", not a whole-sub cancel.
			await expectCustomerProducts({ customer, notPresent: [pro.id] });
			expect(customer.products.some((p) => p.id === addon.id)).toBe(true);

			const subsAfter = await ctx.stripeCli.subscriptions.list({
				customer: stripeCustomerId!,
			});
			expect(subsAfter.data.length).toBeGreaterThan(0);

			// The shared sub's open invoice must NOT be voided (it covers the surviving add-on).
			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId!,
				subscription: subscriptionId,
			});
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				0,
			);
			await expectNoCredit({ ctx, stripeCustomerId: stripeCustomerId! });
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Void-correctness: open/uncollectible voided, paid untouched
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: uncollectible invoice is voided on the inline cancel path")}`, async () => {
	const customerId = "qa-uncollectible";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			const before = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			const open = before.data.find((inv) => inv.status === "open");
			expect(open).toBeDefined();
			const uncollectible = await ctx.stripeCli.invoices.markUncollectible(
				open!.id,
			);
			expect(uncollectible.status).toBe("uncollectible");

			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			await timeout(3000);

			const after = await ctx.stripeCli.invoices.retrieve(uncollectible.id);
			expect(after.status).toBe("void");
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer,
				notPresent: [pro.id],
				active: [free.id],
			});
		},
	});
});

test(`${chalk.yellowBright("edge: paid invoice untouched, only the open invoice voided")}`, async () => {
	const customerId = "qa-paid-untouched";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			// Initial attach invoice is paid (success card); driveProductPastDue then fails the renewal.
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			});
			await timeout(3000);

			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			expect(invoices.data.filter((inv) => inv.status === "paid").length).toBe(
				1,
			);
			expect(invoices.data.filter((inv) => inv.status === "open").length).toBe(
				0,
			);
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				1,
			);
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gating: an omitted cancel_action must not resolve to immediate or void
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("edge: omitted cancel_action on past_due does not resolve/void")}`, async () => {
	const customerId = "qa-no-cancel-action";
	const { free, pro } = buildProductSet();
	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await withVoidFlag({
		ctx,
		enabled: true,
		fn: async () => {
			const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
				ctx,
				testClockId: testClockId!,
				customerId,
				productId: pro.id,
			});
			// No cancel_action: nothing to cancel, no resolution, no void. recalculate_balances
			// is a no-op billing-relevant field so the request has something to act on.
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				recalculate_balances: { enabled: true },
			});
			await timeout(3000);

			// pro still present (not removed), open invoice still open, nothing voided.
			const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expect(customer.products.some((p) => p.id === pro.id)).toBe(true);
			const invoices = await ctx.stripeCli.invoices.list({
				customer: stripeCustomerId,
				subscription: subscriptionId,
			});
			expect(
				invoices.data.filter((inv) => inv.status === "open").length,
			).toBeGreaterThan(0);
			expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(
				0,
			);
		},
	});
});
