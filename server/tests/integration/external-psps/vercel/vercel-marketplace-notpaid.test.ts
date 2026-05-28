/**
 * Vercel `marketplace.invoice.notpaid` webhook
 *
 * The notpaid handler must:
 *   1. Suspend the Vercel resource (`status = "suspended"`).
 *   2. Expire the Autumn cus_product and activate the default fallback.
 *   3. Cancel the Stripe subscription.
 *   4. NOT mark the invoice paid.
 *   5. NOT call paymentRecords.reportPayment / invoices.attachPayment.
 *
 * Race-safety: when the paid webhook has already flipped the invoice to
 * `paid`, the notpaid handler short-circuits without canceling the sub.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService";
import {
	expectVercelWebhookSuccess,
	VercelWebhookClient,
} from "./utils/vercel-webhook-client";
import {
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vnotpaid";
const HMAC_SECRET = "test_vercel_client_secret_notpaid";

const newClient = () =>
	new VercelWebhookClient({
		orgId: ctx.org.id,
		env: ctx.env,
		clientSecret: HMAC_SECRET,
	});

const buildPayload = ({
	installationId,
	externalInvoiceId,
}: {
	installationId: string;
	externalInvoiceId: string;
}) => ({
	installationId,
	invoiceId: `vinv_${externalInvoiceId}`,
	externalInvoiceId,
	invoiceTotal: "20.00",
	period: {
		start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
		end: new Date().toISOString(),
	},
	invoiceDate: new Date().toISOString(),
});

const provisionForTest = async ({
	customerId,
	installationId,
	resourceId,
	planId,
}: {
	customerId: string;
	installationId: string;
	resourceId: string;
	planId: string;
}) => {
	const { customer, stripeCustomer, internalCustomerId } =
		await seedVercelCustomer({ ctx, customerId, installationId });
	await seedVercelResource({ ctx, resourceId, installationId });

	const stripeCustomerExpanded = await ctx.stripeCli.customers.retrieve(
		stripeCustomer.id,
		{ expand: ["subscriptions"] },
	);
	if (stripeCustomerExpanded.deleted)
		throw new Error("Stripe customer deleted before provision");

	const { subscription, cusProduct } = await provisionVercelCusProduct({
		ctx,
		customer,
		stripeCustomer: stripeCustomerExpanded,
		stripeCli: ctx.stripeCli,
		integrationConfigurationId: installationId,
		billingPlanId: planId,
		resourceId,
	});
	if (!subscription) throw new Error("Expected Stripe subscription");

	const latestInvoiceId =
		typeof subscription.latest_invoice === "string"
			? subscription.latest_invoice
			: subscription.latest_invoice?.id;
	if (!latestInvoiceId) throw new Error("Expected latest invoice id");

	return {
		customer,
		stripeCustomer: stripeCustomerExpanded,
		subscription,
		cusProduct,
		internalCustomerId,
		externalInvoiceId: latestInvoiceId,
	};
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: full cleanup — sub canceled, resource suspended, cus_product expired
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-notpaid: cancels subscription, suspends resource, expires cus_product, leaves invoice unpaid",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-clean-customer`;
		const installationId = `icfg_${TEST_CASE}_clean`;
		const resourceId = `vre_${TEST_CASE}_clean`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-clean-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-clean`,
		});

		const {
			subscription,
			cusProduct,
			internalCustomerId,
			externalInvoiceId,
		} = await provisionForTest({
			customerId,
			installationId,
			resourceId,
			planId: proRaw.id,
		});

		const result = await newClient().invoiceNotPaid(
			buildPayload({ installationId, externalInvoiceId }),
		);
		expectVercelWebhookSuccess(result);

		// Stripe subscription canceled
		const canceled = await ctx.stripeCli.subscriptions.retrieve(
			subscription.id,
		);
		expect(canceled.status).toBe("canceled");

		// Resource suspended
		const resource = await VercelResourceService.getById({
			db: ctx.db,
			resourceId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(resource?.status).toBe("suspended");

		// Cus_product expired (default may have been activated). Query the
		// table directly — CusProductService.list defaults to filtering
		// expired rows out, and `inStatuses: undefined` falls back to that
		// default via JS destructure semantics.
		const rows = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, cusProduct.id));
		expect(rows.length).toBe(1);
		expect(rows[0]!.status).toBe(CusProductStatus.Expired);
		// Silence unused-var lint for the helper-context variables we still
		// destructure for symmetry with other tests.
		void internalCustomerId;

		// Invoice was NOT marked paid
		const invoice = await ctx.stripeCli.invoices.retrieve(externalInvoiceId);
		expect(invoice.status).not.toBe("paid");
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: race — paid won first; notpaid short-circuits without canceling
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-notpaid: short-circuits without canceling when invoice is already paid (race with paid webhook)",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-race-customer`;
		const installationId = `icfg_${TEST_CASE}_race`;
		const resourceId = `vre_${TEST_CASE}_race`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-race-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-race`,
		});

		const { subscription, externalInvoiceId } = await provisionForTest({
			customerId,
			installationId,
			resourceId,
			planId: proRaw.id,
		});

		// Simulate the "paid won the race" state: mark the invoice paid out of
		// band first, then deliver notpaid.
		await ctx.stripeCli.invoices.pay(externalInvoiceId, {
			paid_out_of_band: true,
		});

		const result = await newClient().invoiceNotPaid(
			buildPayload({ installationId, externalInvoiceId }),
		);
		expectVercelWebhookSuccess(result);

		const sub = await ctx.stripeCli.subscriptions.retrieve(subscription.id);
		expect(sub.status).not.toBe("canceled");

		const resource = await VercelResourceService.getById({
			db: ctx.db,
			resourceId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		// Resource should not have been suspended since we short-circuited.
		expect(resource?.status).toBe("ready");
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: lazy migration — legacy charge_automatically sub flips before cancel
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-notpaid: lazy-migrates legacy charge_automatically sub to send_invoice before canceling",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-legacy-customer`;
		const installationId = `icfg_${TEST_CASE}_legacy`;
		const resourceId = `vre_${TEST_CASE}_legacy`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-legacy-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-legacy`,
		});

		const { subscription, externalInvoiceId } = await provisionForTest({
			customerId,
			installationId,
			resourceId,
			planId: proRaw.id,
		});

		// Force the sub back into legacy charge_automatically.
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			collection_method: "charge_automatically",
		});

		// Snapshot the migration helper's effect by retrieving the sub BEFORE
		// cancellation. We can't observe the migrated state after cancel
		// because cancel always sets status=canceled, but the helper updates
		// collection_method first and that change is visible in the canceled
		// subscription too.
		const result = await newClient().invoiceNotPaid(
			buildPayload({ installationId, externalInvoiceId }),
		);
		expectVercelWebhookSuccess(result);

		const canceled = await ctx.stripeCli.subscriptions.retrieve(
			subscription.id,
		);
		expect(canceled.status).toBe("canceled");
		expect(canceled.collection_method).toBe("send_invoice");
	},
);
