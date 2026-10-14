/**
 * invoices.reissue on an open invoice whose subscription has since ended.
 *
 * Contract:
 *   subscription canceled → original void, replacement issued standalone
 *                           (no subscription, original currency, no deferred pointer)
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1, AttachParamsV1Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";

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
