/**
 * TDD (feature) for: void-on-cancel orgs cancel past_due customers immediately.
 *
 * Contract under test:
 *   New behavior:
 *     - flag void_invoices_on_subscription_deletion ON + product past_due + cancel_action "cancel_end_of_cycle"
 *       -> resolves to an IMMEDIATE cancel: product removed now, default/free active now (not scheduled).
 *   Side effects:
 *     - that immediate cancel voids the subscription's open/uncollectible invoices INLINE
 *       (the Autumn cancel sets the sub:<id> lock, so the subscription.deleted webhook is skipped).
 *   Gating (unchanged behavior, control cases):
 *     - flag OFF + past_due + cancel_end_of_cycle -> still scheduled-cancel, open invoice NOT voided.
 *     - flag ON + NOT past_due + cancel_end_of_cycle -> normal end-of-cycle (canceling + free scheduled).
 *
 * Pre-impl red: the PRIMARY test fails because cancel_end_of_cycle on a past_due sub today
 *   schedules the cancel (pro stays, free not active) and never voids the open invoice on the
 *   Autumn-initiated path.
 *
 * past_due setup: attach with a good card, swap the SUBSCRIPTION's default_payment_method to a
 * failing card and advance the test clock so the renewal charge fails (produces a real open
 * invoice in Stripe). The customer_product.status is then flipped to past_due directly in
 * Postgres (+ cache bust) rather than waiting on the subscription.updated webhook -- there is no
 * public API to set past_due, and the webhook sync is the flakiest part of a local run. This
 * mirrors balances/cron/past-due-reset.test.ts. What we're actually testing is the cancel
 * behavior, not the past_due sync.
 *
 * These tests mutate shared org.config, so they run serially (plain `test`) and restore in `finally`.
 */

import { expect, test } from "bun:test";
import type { Stripe } from "stripe";
import type { ApiCustomerV3 } from "@autumn/shared";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductPastDue,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { OrgService } from "@/internal/orgs/OrgService";
import { timeout } from "@/utils/genUtils";

/**
 * Fail the renewal to create a real open invoice, then force the product into past_due
 * directly in Postgres (no webhook dependency). Returns the Stripe customer + subscription ids.
 */
const driveProductPastDue = async ({
	ctx,
	testClockId,
	customerId,
	productId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	testClockId: string;
	customerId: string;
	productId: string;
}) => {
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId,
	});

	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await attachFailedPaymentMethod({
		stripeCli: ctx.stripeCli,
		customer: customer!,
	});

	const paymentMethods = await ctx.stripeCli.paymentMethods.list({
		customer: customer!.processor?.id,
	});
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		default_payment_method: paymentMethods.data[0].id,
	});

	await advanceToNextInvoice({ stripeCli: ctx.stripeCli, testClockId });
	await timeout(4000);

	// Flip the customer_product to past_due directly (no public API; webhook sync is unreliable
	// locally), then bust the cache so the HTTP server re-reads it from Postgres.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId,
	);
	await ctx.db
		.update(customerProducts)
		.set({ status: CusProductStatus.PastDue })
		.where(eq(customerProducts.id, customerProduct!.id));
	await deleteCachedFullCustomer({ ctx, customerId });

	return { subscriptionId, stripeCustomerId: customer!.processor?.id };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRIMARY (pre-impl RED): flag on + past_due + cancel_end_of_cycle -> immediate + void
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("cancel eoc past_due: flag on -> cancels immediately and voids open invoice")}`, async () => {
	const customerId = "cancel-pastdue-void-immediate";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const { subscriptionId, stripeCustomerId } = await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});

		// Precondition: product is past_due with an open (unpaid) invoice
		const customerBeforeCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductPastDue({
			customer: customerBeforeCancel,
			productId: pro.id,
		});

		const invoicesBeforeCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesBeforeCancel.data.filter((inv) => inv.status === "open").length,
		).toBeGreaterThan(0);

		// ── Action: cancel_end_of_cycle on a past_due sub with the flag on ──
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Read-consistency wait for the inline void (NOT a webhook wait).
		await timeout(3000);

		// ── Contract assertion 1: immediate downgrade (not scheduled) ──
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			active: [free.id],
		});

		// ── Contract assertion 2: Stripe subscription cancelled now ──
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// ── Contract assertion 3: open invoice voided inline ──
		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "open").length,
		).toBe(0);
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "void").length,
		).toBeGreaterThan(0);

		// ── Contract assertion 4: no proration credit issued for the unpaid cycle ──
		// The customer never paid this cycle, so cancelling must not refund/credit them.
		const allInvoices = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
		});
		expect(
			allInvoices.data.filter((inv) => (inv.total ?? 0) < 0).length,
		).toBe(0);
		const stripeCustomer = (await ctx.stripeCli.customers.retrieve(
			stripeCustomerId!,
		)) as Stripe.Customer;
		expect(stripeCustomer.balance).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROL A: flag OFF + past_due + cancel_end_of_cycle -> unchanged (no immediate, no void)
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("cancel eoc past_due: flag off -> stays scheduled, invoice not voided")}`, async () => {
	const customerId = "cancel-pastdue-void-flag-off";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: false,
			},
		},
	});

	try {
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

		// Not immediately removed: a Stripe subscription still exists (cancel scheduled at period end)
		const subsAfterCancel = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		expect(subsAfterCancel.data.length).toBeGreaterThan(0);

		// Open invoice is NOT voided when the flag is off
		const invoicesAfterCancel = await ctx.stripeCli.invoices.list({
			customer: stripeCustomerId,
			subscription: subscriptionId,
		});
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "open").length,
		).toBeGreaterThan(0);
		expect(
			invoicesAfterCancel.data.filter((inv) => inv.status === "void").length,
		).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROL B: flag ON + NOT past_due + cancel_end_of_cycle -> normal end-of-cycle
// ═══════════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("cancel eoc not past_due: flag on -> normal end-of-cycle (no immediate)")}`, async () => {
	const customerId = "cancel-pastdue-void-not-pastdue";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const originalOrgConfig = ctx.org.config;
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				void_invoices_on_subscription_deletion: true,
			},
		},
	});

	try {
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Active (paid) sub: flag must NOT force immediate; normal end-of-cycle applies.
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerAfterCancel,
			productId: free.id,
		});

		// Side-effect contract: a paid, non-past_due cancel must NOT void any invoice.
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const invoices = await ctx.stripeCli.invoices.list({
			customer: customer!.processor?.id,
			subscription: subscriptionId,
		});
		expect(invoices.data.filter((inv) => inv.status === "void").length).toBe(0);
	} finally {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: { config: originalOrgConfig },
		});
	}
});
