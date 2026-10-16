/**
 * invoices.reissue on an open invoice whose subscription has since ended.
 *
 * Contract:
 *   subscription canceled → original void, replacement issued standalone
 *                           (no subscription, original currency, no deferred pointer)
 *   deferred original     → voiding it expires the pending plan; nothing is repointed
 *   card original         → replacement still charged to the ended subscription's card
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiListInvoiceV1,
	type AttachParamsV1Input,
	CusProductStatus,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type ReissueResponse = {
	invoice: ApiListInvoiceV1;
	voided_invoice_id: string;
	preview: { total: number };
};

test(`${chalk.yellowBright("invoices.reissue: subscription canceled → replacement issued standalone, original void")}`, async () => {
	const customerId = "inv-reissue-canceled-sub";
	const pro = products.base({
		id: "pro-reissue-canceled-sub",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const { autumnV2_3, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: true,
			net_terms_days: 7,
		},
	});
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const originalRow = list[0];

	const stripeSubId = stripeInvoiceToStripeSubscriptionId(
		await ctx.stripeCli.invoices.retrieve(originalRow.stripe_id),
	);
	if (!stripeSubId) throw new Error("original invoice has no subscription");
	await ctx.stripeCli.subscriptions.cancel(stripeSubId);
	expect(
		(await ctx.stripeCli.invoices.retrieve(originalRow.stripe_id)).status,
	).toBe("open");

	const body = {
		invoice_id: originalRow.id,
		issue_method: "send",
		lines: { add: [{ amount: -5, description: "Discount" }] },
	};
	const { preview } = (await autumnV2_3.post("/invoices.reissue", {
		...body,
		preview: true,
	})) as ReissueResponse;
	expect(preview.total).toBe(15);

	const { invoice, voided_invoice_id } = (await autumnV2_3.post(
		"/invoices.reissue",
		body,
	)) as ReissueResponse;

	expect(voided_invoice_id).toBe(originalRow.id);
	const original = await ctx.stripeCli.invoices.retrieve(originalRow.stripe_id);
	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id);

	expect(original.status).toBe("void");
	expect(replacement.status).toBe("open");
	expect(replacement.total).toBe(1500);
	expect(replacement.currency).toBe(original.currency);
	expect(stripeInvoiceToStripeSubscriptionId(replacement)).toBeUndefined();
	expect(replacement.metadata?.autumn_metadata_id).toBeUndefined();
});

test(`${chalk.yellowBright("invoices.reissue: subscription canceled, deferred original → pending plan expires, pointer not carried over")}`, async () => {
	const customerId = `inv-reissue-canceled-sub-pending-${Date.now()}`;
	const pro = products.base({
		id: "pro-reissue-canceled-sub-pending",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const { autumnV2_3, autumnV2_4, customer } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: false,
			net_terms_days: 7,
		},
	});
	const findPlan = async () =>
		(
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
	const pending = await findPlan();
	expect(pending?.status).toBe(CusProductStatus.Pending);
	const metadataId = pending?.metadata_id ?? "";

	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const originalRow = list[0];
	const originalStripe = await ctx.stripeCli.invoices.retrieve(
		originalRow.stripe_id,
	);
	expect(originalStripe.metadata?.autumn_metadata_id).toBe(metadataId);
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(originalStripe);
	if (!stripeSubId) throw new Error("original invoice has no subscription");
	await ctx.stripeCli.subscriptions.cancel(stripeSubId);

	const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: originalRow.id,
	})) as ReissueResponse;

	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id);
	expect(replacement.status).toBe("open");
	expect(stripeInvoiceToStripeSubscriptionId(replacement)).toBeUndefined();
	expect(replacement.metadata?.autumn_metadata_id).toBeUndefined();

	const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });
	expect(metadata?.stripe_invoice_id).not.toBe(invoice.stripe_id);
	expect((await findPlan())?.status).toBe(CusProductStatus.Expired);
});

test(`${chalk.yellowBright("invoices.reissue: subscription canceled, card original → replacement charged to the subscription's card")}`, async () => {
	const customerId = "inv-reissue-canceled-sub-card";
	const pro = products.base({
		id: "pro-reissue-canceled-sub-card",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const { autumnV2_3, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const originalRow = list[0];
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(
		await ctx.stripeCli.invoices.retrieve(originalRow.stripe_id),
	);
	if (!stripeSubId) throw new Error("original invoice has no subscription");

	// The subscription bills card A; the customer's default becomes card B.
	const stripeCusId = customer?.processor?.id ?? "";
	const cardA = await ctx.stripeCli.paymentMethods.attach("pm_card_visa", {
		customer: stripeCusId,
	});
	const cardB = await ctx.stripeCli.paymentMethods.attach(
		"pm_card_mastercard",
		{ customer: stripeCusId },
	);
	await ctx.stripeCli.subscriptions.update(stripeSubId, {
		default_payment_method: cardA.id,
	});
	await ctx.stripeCli.customers.update(stripeCusId, {
		invoice_settings: { default_payment_method: cardB.id },
	});
	await ctx.stripeCli.subscriptions.cancel(stripeSubId);

	const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: originalRow.id,
		lines: { add: [{ description: "Setup", amount: 10 }] },
	})) as ReissueResponse;

	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id, {
		expand: ["payments.data.payment.payment_intent"],
	});
	expect(stripeInvoiceToStripeSubscriptionId(replacement)).toBeUndefined();
	expect(replacement.status).toBe("paid");
	const paymentIntent = replacement.payments?.data[0]?.payment.payment_intent as
		| Stripe.PaymentIntent
		| null
		| undefined;
	expect(paymentIntent?.payment_method).toBe(cardA.id);
});

test(`${chalk.yellowBright("invoices.reissue: subscription canceled, deferred draft original → parked and its pending plan expires")}`, async () => {
	const customerId = `inv-reissue-canceled-sub-draft-${Date.now()}`;
	const pro = products.base({
		id: "pro-reissue-canceled-sub-draft",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const { autumnV2_3, autumnV2_4, customer } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});

	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		invoice_mode: {
			enabled: true,
			finalize: false,
			enable_plan_immediately: false,
			net_terms_days: 7,
		},
	});
	const findPlan = async () =>
		(
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: ALL_STATUSES,
			})
		).find((customerProduct) => customerProduct.product.id === pro.id);
	expect((await findPlan())?.status).toBe(CusProductStatus.Pending);

	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	const originalRow = list[0];
	const originalStripe = await ctx.stripeCli.invoices.retrieve(
		originalRow.stripe_id,
	);
	expect(originalStripe.status).toBe("draft");
	expect(originalStripe.metadata?.autumn_metadata_id).toBeTruthy();
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(originalStripe);
	if (!stripeSubId) throw new Error("original invoice has no subscription");
	await ctx.stripeCli.subscriptions.cancel(stripeSubId);

	const { invoice, voided_invoice_id } = (await autumnV2_3.post(
		"/invoices.reissue",
		{ invoice_id: originalRow.id },
	)) as ReissueResponse;

	expect(voided_invoice_id).toBeNull();
	expect(
		(await ctx.stripeCli.invoices.retrieve(originalRow.stripe_id)).status,
	).toBe("draft");
	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id);
	expect(stripeInvoiceToStripeSubscriptionId(replacement)).toBeUndefined();
	expect(replacement.metadata?.autumn_metadata_id).toBeUndefined();
	expect((await findPlan())?.status).toBe(CusProductStatus.Expired);
});
