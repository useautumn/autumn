/**
 * Vercel invoice.finalized → processVercelInvoice
 *
 * When Stripe finalizes a Vercel-tagged subscription's invoice it fires
 * `invoice.finalized` → `setupInvoiceFinalizedContext` → `processVercelInvoice`.
 * The handler submits the finalized invoice to Vercel via the SDK
 * (`submitBillingDataToVercel` + `submitInvoiceToVercel`).
 *
 * This test sets `ctx.testOptions.mockVercelApi`, so the SDK hits our dev
 * server's `/__test/vercel/api` mock and records each call to Redis.
 *
 * We invoke `processVercelInvoice` directly from the test process with a
 * constructed `StripeWebhookContext` rather than waiting for Stripe to
 * deliver the real `invoice.finalized` webhook. The webhook delivery path
 * is ngrok-bound to a different dev server in this dev environment, but the
 * handler itself is what we care about — and calling it directly still
 * goes through `getVercelSdkServerURL()`, which points at our mock only for
 * this explicitly-marked test context.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { logger } from "@/external/logtail/logtailUtils";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions";
import { processVercelInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/tasks/processVercelInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";
import {
	clearVercelCaptures,
	readVercelCaptures,
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
	waitForVercelCapture,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vfin";

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: processVercelInvoice submits billing data + invoice to Vercel SDK
// ─────────────────────────────────────────────────────────────────────────────

test(
	`${chalk.yellowBright(
		"vercel-invoice-finalized: processVercelInvoice submits billing data + invoice to Vercel SDK (no CPM required)",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-customer`;
		const installationId = `icfg_${TEST_CASE}_main`;
		const resourceId = `vre_${TEST_CASE}_main`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-main-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx);
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-main`,
		});

		// Clear any leftover captures for this installation from previous runs.
		await clearVercelCaptures(installationId);

		const { customer, stripeCustomer } = await seedVercelCustomer({
			ctx,
			customerId,
			installationId,
		});
		await seedVercelResource({ ctx, resourceId, installationId });

		const stripeCustomerExpanded = await ctx.stripeCli.customers.retrieve(
			stripeCustomer.id,
			{ expand: ["subscriptions"] },
		);
		if (stripeCustomerExpanded.deleted)
			throw new Error("Stripe customer deleted before provision");

		const { subscription } = await provisionVercelCusProduct({
			ctx,
			customer,
			stripeCustomer: stripeCustomerExpanded,
			stripeCli: ctx.stripeCli,
			integrationConfigurationId: installationId,
			billingPlanId: proRaw.id,
			resourceId,
		});
		expect(subscription).not.toBeNull();

		const invoiceId =
			typeof subscription!.latest_invoice === "string"
				? subscription!.latest_invoice
				: subscription!.latest_invoice?.id;
		expect(invoiceId).toBeDefined();

		// Build the same expanded invoice + subscription that the Stripe
		// finalize webhook handler would see, then drive
		// `processVercelInvoice` directly with a constructed context.
		const stripeInvoice = await getStripeInvoice({
			stripeClient: ctx.stripeCli,
			invoiceId: invoiceId!,
			expand: ["discounts.source.coupon", "total_discount_amounts"],
		});
		const stripeSubscription = await getExpandedStripeSubscription({
			ctx,
			subscriptionId: subscription!.id,
		});

		const webhookCtx: StripeWebhookContext = {
			...ctx,
			fullCustomer: customer,
			testOptions: {
				...(ctx.testOptions ?? {}),
				mockVercelApi: true,
			},
			stripeEvent: {
				id: "evt_test_vfin",
				type: "invoice.finalized",
			} as any,
		} as StripeWebhookContext;
		webhookCtx.logger = logger;

		await processVercelInvoice({
			ctx: webhookCtx,
			stripeInvoice,
			stripeSubscription,
		});

		// SDK calls should land on the test mock virtually immediately.
		const billingCall = await waitForVercelCapture({
			installationId,
			predicate: (call) =>
				call.method === "POST" &&
				call.path === `/v1/installations/${installationId}/billing` &&
				call.installationId === installationId,
			timeoutMs: 10000,
		});
		expect(billingCall).not.toBeNull();

		const invoiceCall = await waitForVercelCapture({
			installationId,
			predicate: (call) =>
				call.method === "POST" &&
				call.path === `/v1/installations/${installationId}/billing/invoices`,
			timeoutMs: 10000,
		});
		expect(invoiceCall).not.toBeNull();

		// Shape sanity
		expect(billingCall!.body.billing.items).toBeInstanceOf(Array);
		expect(billingCall!.body.period.start).toBeDefined();
		expect(billingCall!.body.period.end).toBeDefined();

		expect(typeof invoiceCall!.body.externalId).toBe("string");
		expect(invoiceCall!.body.items.length).toBeGreaterThan(0);
		expect(invoiceCall!.body.items[0].billingPlanId).toBe(proRaw.id);

		// Snapshot the raw captures for debugging if anything regresses.
		const allCaptures = await readVercelCaptures(installationId);
		expect(allCaptures.length).toBeGreaterThanOrEqual(2);
	},
	30000,
);
