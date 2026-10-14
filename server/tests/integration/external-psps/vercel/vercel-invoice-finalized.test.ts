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

		expect(billingCall!.body.billing.items).toBeInstanceOf(Array);
		expect(billingCall!.body.period.start).toBeDefined();
		expect(billingCall!.body.period.end).toBeDefined();

		expect(typeof invoiceCall!.body.externalId).toBe("string");
		expect(invoiceCall!.body.items.length).toBeGreaterThan(0);
		expect(invoiceCall!.body.items[0].billingPlanId).toBe(proRaw.id);

		const allCaptures = await readVercelCaptures(installationId);
		expect(allCaptures.length).toBeGreaterThanOrEqual(2);
	},
	30000,
);
