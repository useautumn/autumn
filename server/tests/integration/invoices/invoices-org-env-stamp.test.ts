import { expect, test } from "bun:test";
import { InvoiceStatus, invoices, ProcessorType } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { recordRevenueCatInvoice } from "@/external/revenueCat/utils/recordRevenueCatInvoice";
import { CusService } from "@/internal/customers/CusService";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { ProductService } from "@/internal/products/ProductService";

const getOrgEnvByStripeId = async ({ stripeId }: { stripeId: string }) => {
	const [row] = await ctx.db
		.select({ org_id: invoices.org_id, env: invoices.env })
		.from(invoices)
		.where(eq(invoices.stripe_id, stripeId));
	return row;
};

const getInternalCustomerId = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return customer.internal_id;
};

test.concurrent(
	`${chalk.yellowBright("invoices org/env: billing attach stamps org_id and env")}`,
	async () => {
		const customerId = "inv-org-env-attach";
		const pro = products.pro({
			id: "pro-org-env-attach",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const internalCustomerId = await getInternalCustomerId({ customerId });
		const rows = await ctx.db
			.select({ org_id: invoices.org_id, env: invoices.env })
			.from(invoices)
			.where(eq(invoices.internal_customer_id, internalCustomerId));

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row).toEqual({ org_id: ctx.org.id, env: ctx.env });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices org/env: invoices.insert stamps new rows and legacy conflicts")}`,
	async () => {
		const customerId = "inv-org-env-insert";
		const runTag = Date.now().toString();
		const newStripeId = `in_org_env_new_${runTag}`;
		const legacyStripeId = `in_org_env_legacy_${runTag}`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const internalCustomerId = await getInternalCustomerId({ customerId });

		await ctx.db.insert(invoices).values({
			id: `inv_org_env_legacy_${runTag}`,
			internal_customer_id: internalCustomerId,
			stripe_id: legacyStripeId,
			status: "open",
			total: 1,
			currency: "usd",
		});
		expect(await getOrgEnvByStripeId({ stripeId: legacyStripeId })).toEqual({
			org_id: null,
			env: null,
		});

		await autumnV2_2.post("/invoices.insert", {
			invoices: [newStripeId, legacyStripeId].map((stripeId) => ({
				customer_id: customerId,
				plan_ids: [],
				stripe_id: stripeId,
				processor_type: ProcessorType.Stripe,
				status: "paid",
				total: 10,
				amount_paid: 10,
				refunded_amount: 0,
				created_at: Date.now(),
			})),
		});

		for (const stripeId of [newStripeId, legacyStripeId]) {
			expect(await getOrgEnvByStripeId({ stripeId })).toEqual({
				org_id: ctx.org.id,
				env: ctx.env,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices org/env: upsert over a legacy unstamped row stamps it")}`,
	async () => {
		const customerId = "inv-org-env-upsert";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const internalCustomerId = await getInternalCustomerId({ customerId });
		const runTag = Date.now().toString();
		const stripeId = `in_org_env_upsert_${runTag}`;

		await ctx.db.insert(invoices).values({
			id: `inv_org_env_upsert_${runTag}`,
			internal_customer_id: internalCustomerId,
			stripe_id: stripeId,
			status: InvoiceStatus.Open,
			total: 1,
			currency: "usd",
		});
		expect(await getOrgEnvByStripeId({ stripeId })).toEqual({
			org_id: null,
			env: null,
		});

		await InvoiceService.upsert({
			db: ctx.db,
			invoice: {
				id: `inv_org_env_upsert_new_${runTag}`,
				internal_customer_id: internalCustomerId,
				org_id: ctx.org.id,
				env: ctx.env,
				stripe_id: stripeId,
				status: InvoiceStatus.Paid,
				total: 1,
				currency: "usd",
			},
		});

		expect(await getOrgEnvByStripeId({ stripeId })).toEqual({
			org_id: ctx.org.id,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices org/env: upsert from another customer leaves a legacy row unstamped")}`,
	async () => {
		const customerId = "inv-org-env-upsert-owner";
		const otherCustomerId = "inv-org-env-upsert-other";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: otherCustomerId }]),
			],
			actions: [],
		});
		const internalCustomerId = await getInternalCustomerId({ customerId });
		const otherInternalCustomerId = await getInternalCustomerId({
			customerId: otherCustomerId,
		});
		const runTag = Date.now().toString();
		const stripeId = `in_org_env_upsert_owner_${runTag}`;

		await ctx.db.insert(invoices).values({
			id: `inv_org_env_upsert_owner_${runTag}`,
			internal_customer_id: internalCustomerId,
			stripe_id: stripeId,
			status: InvoiceStatus.Open,
			total: 1,
			currency: "usd",
		});

		await InvoiceService.upsert({
			db: ctx.db,
			invoice: {
				id: `inv_org_env_upsert_other_${runTag}`,
				internal_customer_id: otherInternalCustomerId,
				org_id: "org_some_other_org",
				env: ctx.env,
				stripe_id: stripeId,
				status: InvoiceStatus.Paid,
				total: 1,
				currency: "usd",
			},
		});

		expect(await getOrgEnvByStripeId({ stripeId })).toEqual({
			org_id: null,
			env: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices org/env: legacy createInvoiceFromStripe stamps org_id and env")}`,
	async () => {
		const customerId = "inv-org-env-legacy-create";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const internalCustomerId = await getInternalCustomerId({ customerId });
		const stripeId = `in_org_env_create_${Date.now()}`;

		await InvoiceService.createInvoiceFromStripe({
			db: ctx.db,
			stripeInvoice: {
				id: stripeId,
				created: Math.floor(Date.now() / 1000),
				total: 1000,
				amount_paid: 1000,
				currency: "usd",
				status: "paid",
				hosted_invoice_url: null,
				discounts: [],
				status_transitions: { paid_at: null },
			} as unknown as Stripe.Invoice,
			internalCustomerId,
			productIds: [],
			internalProductIds: [],
			org: ctx.org,
			env: ctx.env,
		});

		expect(await getOrgEnvByStripeId({ stripeId })).toEqual({
			org_id: ctx.org.id,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices org/env: RevenueCat invoice stamps org_id and env")}`,
	async () => {
		const customerId = "inv-org-env-revenuecat";
		const pro = products.pro({
			id: "pro-org-env-revenuecat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const product = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const transactionId = `rc_org_env_${Date.now()}`;

		await recordRevenueCatInvoice({
			ctx,
			event: { transaction_id: transactionId, price: 5 },
			customer,
			product,
		});

		expect(await getOrgEnvByStripeId({ stripeId: transactionId })).toEqual({
			org_id: ctx.org.id,
			env: ctx.env,
		});
	},
);
