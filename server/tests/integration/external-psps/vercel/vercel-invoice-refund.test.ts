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
 * 2. Internal `GET /customers/:id/invoices/:stripe_id/metadata` (dashboard
 *    session auth) exposes it so the invoice sheet can gate the refund button.
 * 3. `POST /customers/:id/invoices/:stripe_id/refund` calls Vercel's
 *    `updateInvoice` with `{ action: "refund", reason, total }`. Nothing is
 *    written to Autumn yet — Vercel settles asynchronously.
 * 4. `marketplace.invoice.refunded` webhook increments `refunded_amount`.
 *
 * The Vercel SDK is pointed at the dev server's `/__test/vercel/api` mock via
 * `x-mock-vercel-api` / `ctx.testOptions.mockVercelApi`.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import {
	createDashboardSession,
	dashboardGet,
} from "@tests/utils/testInitUtils/dashboardSession";
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
	readVercelCaptures,
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
	waitForVercelCapture,
} from "./utils/vercel-test-helpers";
import {
	expectVercelWebhookSuccess,
	VercelWebhookClient,
} from "./utils/vercel-webhook-client";

const TEST_CASE = "vrefund";
const MOCK_HEADERS = { "x-mock-vercel-api": "true" };

const autumn = new AutumnInt();
const HMAC_SECRET = "test_vercel_client_secret_refund";

const webhookClient = () =>
	new VercelWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		clientSecret: HMAC_SECRET,
	});

const refundedPayload = ({
	installationId,
	stripeInvoiceId,
	amount,
}: {
	installationId: string;
	stripeInvoiceId: string;
	amount: string;
}) => ({
	installationId,
	invoiceId: `vi_test_${stripeInvoiceId}`,
	externalInvoiceId: stripeInvoiceId,
	amount,
	reason: "Refund issued from Autumn",
	period: {
		start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
		end: new Date().toISOString(),
	},
});

const getRefundedAmount = async (stripeInvoiceId: string) =>
	(
		await InvoiceService.getByStripeId({
			db: ctx.db,
			stripeId: stripeInvoiceId,
		})
	)?.refunded_amount;

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

	await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
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

	const session = await createDashboardSession(ctx);
	try {
		const { status, data } = await dashboardGet<{
			metadata: Record<string, string>;
		}>(
			ctx,
			session,
			`/customers/${customerId}/invoices/${stripeInvoiceId}/metadata`,
		);
		expect(status).toBe(200);
		expect(data.metadata.vercel_invoice_id).toMatch(/^vi_test_/);
		expect(typeof data.metadata.vercel_installation_id).toBe("string");
	} finally {
		await session.cleanup();
	}
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: full refund → Vercel Invoice Actions; refunded webhook → DB
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: full refund requests via Vercel, refunded webhook records it",
)}`, async () => {
	const { customerId, installationId, stripeInvoiceId } =
		await setupPaidVercelInvoice({ suffix: "full" });

	const res = await autumn.post(
		`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
		{ mode: "full" },
		MOCK_HEADERS,
	);
	expect(res.processor).toBe("vercel");
	expect(res.status).toBe("requested");
	expect(res.amount).toBe(20);

	const refundCall = await waitForVercelCapture({
		installationId,
		predicate: (call) =>
			call.method === "POST" && call.path.endsWith("/actions"),
	});
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

	// Nothing recorded until Vercel confirms.
	expect(await getRefundedAmount(stripeInvoiceId)).toBe(0);

	expectVercelWebhookSuccess(
		await webhookClient().invoiceRefunded(
			refundedPayload({ installationId, stripeInvoiceId, amount: "20.00" }),
		),
	);
	expect(await getRefundedAmount(stripeInvoiceId)).toBe(20);
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: partial refund sends the dollar-string total Vercel expects
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: partial refund sends decimal total and rejects over-refund",
)}`, async () => {
	const { customerId, installationId, stripeInvoiceId } =
		await setupPaidVercelInvoice({ suffix: "partial" });

	// Sub-cent input is normalized so Vercel and the DB agree on the amount.
	await autumn.post(
		`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
		{ mode: "partial", amount: 7.499 },
		MOCK_HEADERS,
	);

	const refundCall = await waitForVercelCapture({
		installationId,
		predicate: (call) =>
			call.method === "POST" && call.path.endsWith("/actions"),
	});
	expect(refundCall!.body.total).toBe("7.50");

	expectVercelWebhookSuccess(
		await webhookClient().invoiceRefunded(
			refundedPayload({ installationId, stripeInvoiceId, amount: "7.50" }),
		),
	);
	expect(await getRefundedAmount(stripeInvoiceId)).toBe(7.5);

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

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: invoice must belong to the customer in the URL
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: refund via another customer's URL is rejected",
)}`, async () => {
	const [{ stripeInvoiceId, installationId }, other] = await Promise.all([
		setupPaidVercelInvoice({ suffix: "owner-a" }),
		setupPaidVercelInvoice({ suffix: "owner-b" }),
	]);

	await expect(
		autumn.post(
			`/customers/${other.customerId}/invoices/${stripeInvoiceId}/refund`,
			{ mode: "full" },
			MOCK_HEADERS,
		),
	).rejects.toThrow(/not found/i);

	const refundCalls = (await readVercelCaptures(installationId)).filter(
		(call) => call.path.endsWith("/actions"),
	);
	expect(refundCalls).toHaveLength(0);
}, 90000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: a Vercel rejection surfaces and records nothing
// ─────────────────────────────────────────────────────────────────────────────

test(`${chalk.yellowBright(
	"vercel-invoice-refund: Vercel 409 (already refund_requested) surfaces as an error",
)}`, async () => {
	const { customerId, stripeInvoiceId } = await setupPaidVercelInvoice({
		suffix: "reject",
	});

	await ctx.stripeCli.invoices.update(stripeInvoiceId, {
		metadata: { vercel_invoice_id: "vi_reject_1" },
	});
	await expect(
		autumn.post(
			`/customers/${customerId}/invoices/${stripeInvoiceId}/refund`,
			{ mode: "full" },
			MOCK_HEADERS,
		),
	).rejects.toThrow();
	expect(await getRefundedAmount(stripeInvoiceId)).toBe(0);
}, 60000);
