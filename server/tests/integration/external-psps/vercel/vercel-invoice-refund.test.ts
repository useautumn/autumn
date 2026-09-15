/**
 * Vercel invoice refunds
 *
 * Vercel invoices have no Stripe charge — Vercel moves the money and Stripe is
 * only the ledger. Refunds therefore go through Vercel's Invoice Actions API
 * (`POST /v1/installations/{id}/billing/invoices/{invoiceId}/actions`), keyed
 * by the Vercel-side invoice id that `submitInvoice` returns.
 *
 * Flow under test:
 * 1. `processVercelInvoice` stores the returned `invoiceId` on the Stripe
 *    invoice as `metadata.vercel_invoice_id`.
 * 2. `GET /customers/:id/invoices/:stripe_id/metadata` exposes it so the
 *    dashboard sheet can gate the refund button.
 * 3. `POST /customers/:id/invoices/:stripe_id/refund` calls Vercel's
 *    `updateInvoice` with `{ action: "refund", reason, total }` and increments
 *    `refunded_amount` on the Autumn invoice.
 *
 * The Vercel SDK is pointed at the dev server's `/__test/vercel/api` mock via
 * `x-mock-vercel-api` / `ctx.testOptions.mockVercelApi`.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { logger } from "@/external/logtail/logtailUtils";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions";
import { processVercelInvoice } from "@/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/tasks/processVercelInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";
import {
	clearVercelCaptures,
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
	waitForVercelCapture,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vrefund";
const MOCK_HEADERS = { "x-mock-vercel-api": "true" };

const autumn = new AutumnInt();

/**
 * Provision a Vercel customer + paid plan, run the finalize task against the
 * mock so the Vercel invoice id lands on Stripe metadata, then mark the
 * invoice paid out of band (what `marketplace.invoice.paid` does).
 */
const setupPaidVercelInvoice = async ({ suffix }: { suffix: string }) => {
	const customerId = `${TEST_CASE}-${suffix}-customer`;
	const installationId = `icfg_${TEST_CASE}_${suffix}`;
	const resourceId = `vre_${TEST_CASE}_${suffix}`;

	const proRaw = products.pro({
		id: `${TEST_CASE}-${suffix}-pro`,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	await setupVercelOrg(ctx);
	await initProductsV0({
		ctx,
		products: [proRaw],
		prefix: `${TEST_CASE}-${suffix}`,
	});
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
		throw new Error("Stripe customer deleted");

	const { subscription } = await provisionVercelCusProduct({
		ctx,
		customer,
		stripeCustomer: stripeCustomerExpanded,
		stripeCli: ctx.stripeCli,
		integrationConfigurationId: installationId,
		billingPlanId: proRaw.id,
		resourceId,
	});
	if (!subscription) throw new Error("Expected Stripe subscription");

	const stripeInvoiceId =
		typeof subscription.latest_invoice === "string"
			? subscription.latest_invoice
			: subscription.latest_invoice?.id;
	if (!stripeInvoiceId) throw new Error("Expected latest_invoice id");

	const stripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: stripeInvoiceId,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});
	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: subscription.id,
	});

	const webhookCtx = {
		...ctx,
		fullCustomer: customer,
		testOptions: { ...(ctx.testOptions ?? {}), mockVercelApi: true },
		stripeEvent: {
			id: `evt_${TEST_CASE}_${suffix}`,
			type: "invoice.finalized",
		} as Stripe.Event,
	} as StripeWebhookContext;
	webhookCtx.logger = logger;

	await processVercelInvoice({
		ctx: webhookCtx,
		stripeInvoice,
		stripeSubscription,
	});

	await ctx.stripeCli.invoices.pay(stripeInvoiceId, { paid_out_of_band: true });

	return { customerId, installationId, stripeInvoiceId };
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: finalize task persists Vercel's invoiceId onto Stripe metadata
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: processVercelInvoice stores vercel_invoice_id on Stripe invoice metadata",
)}`, async () => {
	const { stripeInvoiceId, installationId } = await setupPaidVercelInvoice({
		suffix: "meta",
	});

	const submitCall = await waitForVercelCapture({
		installationId,
		predicate: (call) =>
			call.method === "POST" &&
			call.path === `/v1/installations/${installationId}/billing/invoices`,
	});
	expect(submitCall).not.toBeNull();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.metadata?.vercel_invoice_id).toMatch(/^vi_test_/);
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: metadata route exposes the Vercel invoice id to the dashboard
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: GET /invoices/:stripe_id/metadata returns vercel_invoice_id",
)}`, async () => {
	const { customerId, stripeInvoiceId } = await setupPaidVercelInvoice({
		suffix: "getmeta",
	});

	const res = await autumn.get(
		`/customers/${customerId}/invoices/${stripeInvoiceId}/metadata`,
	);
	expect(res.metadata.vercel_invoice_id).toMatch(/^vi_test_/);
	expect(typeof res.metadata.vercel_installation_id).toBe("string");
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: full refund goes through Vercel Invoice Actions, not Stripe charges
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: full refund calls Vercel updateInvoice and increments refunded_amount",
)}`, async () => {
	const { customerId, installationId, stripeInvoiceId } =
		await setupPaidVercelInvoice({ suffix: "full" });

	const res = await autumn.post(
		`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
		{ mode: "full" },
		MOCK_HEADERS,
	);
	expect(res.processor).toBe("vercel");
	expect(res.amount).toBe(20);

	const refundCall = await waitForVercelCapture({
		installationId,
		predicate: (call) =>
			call.method === "POST" && call.path.endsWith("/actions"),
	});
	expect(refundCall).not.toBeNull();
	expect(refundCall!.path).toMatch(
		new RegExp(
			`^/v1/installations/${installationId}/billing/invoices/vi_test_\\d+/actions$`,
		),
	);
	expect(refundCall!.body).toEqual({
		action: "refund",
		reason: expect.any(String),
		total: "20.00",
	});

	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: stripeInvoiceId,
	});
	expect(autumnInvoice?.refunded_amount).toBe(20);
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: partial refund sends the dollar-string total Vercel expects
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: partial refund sends decimal total and rejects over-refund",
)}`, async () => {
	const { customerId, installationId, stripeInvoiceId } =
		await setupPaidVercelInvoice({ suffix: "partial" });

	await autumn.post(
		`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
		{ mode: "partial", amount: 7.5 },
		MOCK_HEADERS,
	);

	const refundCall = await waitForVercelCapture({
		installationId,
		predicate: (call) =>
			call.method === "POST" && call.path.endsWith("/actions"),
	});
	expect(refundCall!.body.total).toBe("7.50");

	const autumnInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: stripeInvoiceId,
	});
	expect(autumnInvoice?.refunded_amount).toBe(7.5);

	// Remaining refundable is 12.50 — asking for more must 400.
	await expect(
		autumn.post(
			`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
			{ mode: "partial", amount: 13 },
			MOCK_HEADERS,
		),
	).rejects.toThrow();
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: historical Vercel invoice without a mapping is rejected
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: Vercel invoice without vercel_invoice_id metadata returns 400",
)}`, async () => {
	const { customerId, stripeInvoiceId } = await setupPaidVercelInvoice({
		suffix: "legacy",
	});

	// Simulate an invoice submitted before this feature: strip the mapping.
	await ctx.stripeCli.invoices.update(stripeInvoiceId, {
		metadata: { vercel_invoice_id: "" },
	});

	await expect(
		autumn.post(
			`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
			{ mode: "full" },
			MOCK_HEADERS,
		),
	).rejects.toThrow(/vercel/i);
}, 60000);
