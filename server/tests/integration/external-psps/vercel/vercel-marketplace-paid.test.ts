import { expect, test } from "bun:test";
import { CusProductStatus, stripeRefToId } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { provisionVercelCusProduct } from "@/external/vercel/misc/vercelProvisioning";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";
import {
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";
import {
	expectVercelWebhookSuccess,
	VercelWebhookClient,
} from "./utils/vercel-webhook-client";

const TEST_CASE = "vpaid";
const HMAC_SECRET = "test_vercel_client_secret_paid";

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

const provisionAndGetInvoice = async ({
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
		billingPlanId: planId,
		resourceId,
	});

	if (!subscription)
		throw new Error("Expected Stripe subscription from provisionVercel");

	const latestInvoiceId = stripeRefToId(subscription.latest_invoice);
	if (!latestInvoiceId)
		throw new Error("Expected subscription.latest_invoice id");

	return {
		customer,
		stripeCustomer: stripeCustomerExpanded,
		subscription,
		externalInvoiceId: latestInvoiceId,
	};
};

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-paid: marks Stripe invoice paid out-of-band, flips resource to ready, never calls paymentRecords",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-paid-customer`;
		const installationId = `icfg_${TEST_CASE}_paid`;
		const resourceId = `vre_${TEST_CASE}_paid`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-paid-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-paid`,
		});

		const { externalInvoiceId } = await provisionAndGetInvoice({
			customerId,
			installationId,
			resourceId,
			planId: proRaw.id,
		});

		const client = newClient();
		const result = await client.invoicePaid(
			buildPayload({ installationId, externalInvoiceId }),
		);
		expectVercelWebhookSuccess(result);

		const finalInvoice = await ctx.stripeCli.invoices.retrieve(
			externalInvoiceId,
			{ expand: ["payments"] },
		);
		expect(finalInvoice.status).toBe("paid");
		expect(finalInvoice.amount_paid).toBeGreaterThanOrEqual(
			finalInvoice.amount_due,
		);

		const resource = await VercelResourceService.getById({
			db: ctx.db,
			resourceId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(resource?.status).toBe("ready");
	},
);

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-paid: webhook on already-paid invoice is a no-op",
	)}`,
	async () => {
		const customerId = `${TEST_CASE}-idemp-customer`;
		const installationId = `icfg_${TEST_CASE}_idemp`;
		const resourceId = `vre_${TEST_CASE}_idemp`;

		const proRaw = products.pro({
			id: `${TEST_CASE}-idemp-pro`,
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });
		await initProductsV0({
			ctx,
			products: [proRaw],
			prefix: `${TEST_CASE}-idemp`,
		});

		const { externalInvoiceId } = await provisionAndGetInvoice({
			customerId,
			installationId,
			resourceId,
			planId: proRaw.id,
		});

		const client = newClient();
		expectVercelWebhookSuccess(
			await client.invoicePaid(
				buildPayload({ installationId, externalInvoiceId }),
			),
		);

		expectVercelWebhookSuccess(
			await client.invoicePaid(
				buildPayload({ installationId, externalInvoiceId }),
			),
		);

		const invoice = await ctx.stripeCli.invoices.retrieve(externalInvoiceId);
		expect(invoice.status).toBe("paid");
	},
);

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-paid: signature middleware rejects requests with the wrong secret",
	)}`,
	async () => {
		const installationId = `icfg_${TEST_CASE}_bad_sig`;
		await setupVercelOrg(ctx, { clientSecret: HMAC_SECRET });

		const badClient = new VercelWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			clientSecret: "wrong_secret",
		});
		const { response } = await badClient.invoicePaid(
			buildPayload({
				installationId,
				externalInvoiceId: "in_does_not_matter",
			}),
		);
		expect(response.status).toBe(401);
	},
);

test.concurrent(
	`${chalk.yellowBright(
		"vercel-marketplace-paid: lazy-migrates a legacy charge_automatically subscription to send_invoice",
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

		const { subscription, externalInvoiceId, stripeCustomer } =
			await provisionAndGetInvoice({
				customerId,
				installationId,
				resourceId,
				planId: proRaw.id,
			});

		const legacy = await ctx.stripeCli.subscriptions.update(subscription.id, {
			collection_method: "charge_automatically",
		});
		expect(legacy.collection_method).toBe("charge_automatically");

		const client = newClient();
		const result = await client.invoicePaid(
			buildPayload({ installationId, externalInvoiceId }),
		);
		expectVercelWebhookSuccess(result);

		const migrated = await ctx.stripeCli.subscriptions.retrieve(
			subscription.id,
		);
		expect(migrated.collection_method).toBe("send_invoice");
		expect(migrated.days_until_due).toBe(30);

		const invoice = await ctx.stripeCli.invoices.retrieve(externalInvoiceId);
		expect(invoice.status).toBe("paid");

		void stripeCustomer;
	},
);

void CusProductService;
void CusProductStatus;
