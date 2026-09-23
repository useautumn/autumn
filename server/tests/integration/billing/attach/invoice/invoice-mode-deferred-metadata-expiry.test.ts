// Contract: finalized deferred invoice metadata expires at the invoice due date; drafts are unbounded;
// action-required upgrade metadata keeps a short expiry. Cron selection excludes null expires_at rows.

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, MetadataType, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	getExpiredInvoiceMetadata,
	handleVoidInvoiceCron,
} from "@/cron/invoiceCron/runInvoiceCron";
import { getDeferredBillingMetadataExpiresAt } from "@/internal/billing/v2/providers/stripe/execute/getDeferredBillingMetadataExpiresAt";
import { MetadataService } from "@/internal/metadata/MetadataService";

test(`${chalk.yellowBright("invoice-mode metadata expiry: custom payment methods are unbounded")}`, () => {
	const now = Date.now();

	expect(
		getDeferredBillingMetadataExpiresAt({
			deferredInvoiceMode: false,
			paymentMethod: { type: "custom" },
			now,
		}),
	).toBeNull();
	expect(
		getDeferredBillingMetadataExpiresAt({
			deferredInvoiceMode: false,
			paymentMethod: { type: "card" },
			now,
		}),
	).toBe(now + ms.minutes(10));
});

test(`${chalk.yellowBright("invoice-mode metadata expiry: deferred invoices expire at due date only once finalized")}`, () => {
	const dueDateSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
	const finalizedInvoice = {
		status: "open",
		due_date: dueDateSeconds,
	} as Stripe.Invoice;
	const draftInvoice = { status: "draft", due_date: null } as Stripe.Invoice;

	expect(
		getDeferredBillingMetadataExpiresAt({
			deferredInvoiceMode: true,
			stripeInvoice: finalizedInvoice,
		}),
	).toBe(dueDateSeconds * 1000);
	expect(
		getDeferredBillingMetadataExpiresAt({
			deferredInvoiceMode: true,
			stripeInvoice: draftInvoice,
		}),
	).toBeNull();
});

test.concurrent(
	`${chalk.yellowBright("invoice-mode metadata expiry: finalized deferred invoices expire at their due date")}`,
	async () => {
		const customerId = "invoice-mode-deferred-due-date-expiry";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: false,
				finalize: true,
			},
		});

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.due_date).toBeGreaterThan(0);

		const deferredMetadata = await MetadataService.getByStripeInvoiceId({
			db: ctx.db,
			stripeInvoiceId: stripeInvoice.id,
			type: MetadataType.DeferredInvoice,
		});

		expect(deferredMetadata!.expires_at).toBe(stripeInvoice.due_date! * 1000);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode metadata expiry: draft deferred invoices never expire")}`,
	async () => {
		const customerId = "invoice-mode-deferred-draft-no-expiry";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: false,
				finalize: false,
			},
		});

		expect(result.invoice?.stripe_id).toBeDefined();

		const deferredMetadata = await MetadataService.getByStripeInvoiceId({
			db: ctx.db,
			stripeInvoiceId: result.invoice!.stripe_id,
			type: MetadataType.DeferredInvoice,
		});

		expect(deferredMetadata).toBeDefined();
		expect(deferredMetadata!.expires_at).toBeNull();

		const expiredMetadata = await MetadataService.insert({
			db: ctx.db,
			data: {
				id: `meta_invoice_mode_deferred_selector_${Date.now()}`,
				type: MetadataType.DeferredInvoice,
				stripe_invoice_id: "in_invoice_mode_deferred_selector",
				created_at: Date.now(),
				expires_at: Date.now() - ms.minutes(1),
				data: {},
			},
		});

		const voidableMetadata = await getExpiredInvoiceMetadata({
			db: ctx.db,
			now: Date.now(),
			limit: 500,
			cursor: { expiresAt: Number(expiredMetadata.expires_at) - 1, id: "" },
		});
		const voidableIds = new Set(voidableMetadata.map((row) => row.id));

		expect(voidableIds.has(deferredMetadata!.id)).toBe(false);
		expect(voidableIds.has(expiredMetadata.id)).toBe(true);

		await MetadataService.delete({ db: ctx.db, id: expiredMetadata.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-mode metadata expiry: action-required upgrades keep short expiry")}`,
	async () => {
		const customerId = "invoice-mode-action-required-short-expiry";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "authenticate" }),
			],
		});

		const beforeAttach = Date.now();
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customer = await autumnV1.customers.get(customerId);
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id!,
			limit: 1,
		});
		const latestInvoice = stripeInvoices.data[0];
		const metadataId = latestInvoice.metadata?.autumn_metadata_id;

		expect(metadataId).toBeDefined();

		const actionRequiredMetadata = await MetadataService.get({
			db: ctx.db,
			id: metadataId!,
		});

		expect(actionRequiredMetadata).toBeDefined();
		expect(actionRequiredMetadata!.expires_at).toBeGreaterThanOrEqual(
			beforeAttach,
		);
		expect(actionRequiredMetadata!.expires_at).toBeLessThanOrEqual(
			beforeAttach + ms.minutes(11),
		);

		await handleVoidInvoiceCron({
			ctx,
			metadata: actionRequiredMetadata!,
		});

		const voidedInvoice = await ctx.stripeCli.invoices.retrieve(
			latestInvoice.id,
		);
		expect(voidedInvoice.status).toBe("void");
	},
);
