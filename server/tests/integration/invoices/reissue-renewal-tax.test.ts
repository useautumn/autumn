/**
 * invoices.reissue on a renewal invoice carrying Stripe automatic tax.
 *
 * A subscription migrated to send_invoice (ignore_past_due, Vercel) keeps the
 * automatic tax it was created with, so its renewals are both reissuable and
 * automatically taxed. A plain reissue lets Stripe Tax recompute the tax
 * (its auto-created rates cannot be copied by hand); `tax_rate_id: null` must
 * stop it recomputing the tax it just cleared, for that invoice only.
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

const waitForOpenInvoice = async ({
	autumnV2_3,
	customerId,
	excludeIds,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	excludeIds: string[];
}) => {
	for (let attempt = 0; attempt < 30; attempt++) {
		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		const fresh = list.find(
			(invoice) =>
				!excludeIds.includes(invoice.id) && invoice.status === "open",
		);
		if (fresh) return fresh;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error("The renewal invoice never reached Autumn");
};

test(`${chalk.yellowBright("invoices.reissue: automatically taxed renewal → tax_rate_id null reissues it untaxed")}`, async () => {
	const customerId = "inv-reissue-renewal-tax";
	const pro = products.base({
		id: "pro-reissue-renewal-tax",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const { ctx, customer, testClockId, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: true,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const stripeCusId = customer!.processor!.id!;
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	const subscription = subscriptions.data[0] as Stripe.Subscription;
	expect(subscription.automatic_tax.enabled).toBe(true);

	// What ignore_past_due and the Vercel flow do to a live subscription.
	await ctx.stripeCli.subscriptions.update(subscription.id, {
		collection_method: "send_invoice",
		days_until_due: 14,
	});

	const { list: before } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };

	const renewedAt = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 15,
	});

	// Stripe leaves a send_invoice renewal in draft for an hour of clock time.
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		startingFrom: new Date(renewedAt),
		numberOfHours: 2,
		waitForSeconds: 15,
	});

	const renewal = await waitForOpenInvoice({
		autumnV2_3,
		customerId,
		excludeIds: before.map((invoice) => invoice.id),
	});

	// $20 plus 10% AU GST, computed by Stripe Tax on the renewal.
	const renewalStripe = await ctx.stripeCli.invoices.retrieve(
		renewal.stripe_id,
	);
	expect(renewalStripe.automatic_tax.enabled).toBe(true);
	expect(renewalStripe.collection_method).toBe("send_invoice");
	expect(renewalStripe.total).toBe(2200);

	// A plain reissue keeps the tax: Stripe Tax recomputes it on the replacement
	// rather than the original's auto-created rate being copied by hand.
	const { preview } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: renewal.id,
		preview: true,
	})) as { preview: { total: number } };
	expect(preview.total).toBe(22);

	const { invoice: taxed } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: renewal.id,
	})) as { invoice: ApiListInvoiceV1 };
	const taxedStripe = await ctx.stripeCli.invoices.retrieve(taxed.stripe_id);
	expect(taxedStripe.status).toBe("open");
	expect(taxedStripe.automatic_tax.enabled).toBe(true);
	expect(taxedStripe.total).toBe(2200);

	// The taxed replacement is now the open invoice; reissue it without tax.
	const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: taxed.id,
		invoice: { tax_rate_id: null },
	})) as { invoice: ApiListInvoiceV1 };

	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id);
	expect(replacement.automatic_tax.enabled).toBe(false);
	expect(replacement.total).toBe(2000);
	expect(replacement.total_taxes ?? []).toEqual([]);
}, 600_000);
