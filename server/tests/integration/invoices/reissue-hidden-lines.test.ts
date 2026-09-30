/**
 * invoices.reissue on a renewal carrying zero-usage metered placeholders.
 *
 * Stripe bills a metered price with no usage as a $0 line of quantity 0 and
 * hides it on the hosted invoice and PDF; Autumn never stores it. A reissue
 * copies lines as price-less items (quantity 1), so it must drop these rather
 * than surface them as "0 × ..." lines with no plan ("Custom Item"). A hidden
 * line that an edit reprices is still billed.
 */

import { expect, test } from "bun:test";
import { generateKsuid } from "@autumn/ksuid";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const waitForOpenInvoice = async ({
	autumnV2_3,
	customerId,
	excludeIds,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
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

/** A $20 + metered plan renewed with no usage, left open as send_invoice. */
const setupZeroUsageRenewal = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}) => {
	const pro = products.base({
		id: productId,
		items: [items.monthlyPrice({ price: 20 }), items.consumableMessages()],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const { ctx, customer, testClockId, autumnV2_3 } = scenario;

	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: customer!.processor!.id!,
		limit: 1,
	});
	await ctx.stripeCli.subscriptions.update(
		(subscriptions.data[0] as Stripe.Subscription).id,
		{ collection_method: "send_invoice", days_until_due: 14 },
	);

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
	const renewalLines = await ctx.stripeCli.invoices.listLineItems(
		renewal.stripe_id,
		{ limit: 100 },
	);
	const hiddenLine = renewalLines.data.find(
		(line) => line.amount === 0 && line.quantity === 0,
	);
	expect(hiddenLine).toBeDefined();

	return { ...scenario, renewal, hiddenLine: hiddenLine! };
};

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: zero-usage metered placeholders are not copied onto the replacement")}`,
	async () => {
		const customerId = "inv-reissue-hidden-lines";
		const { ctx, autumnV2_3, renewal } = await setupZeroUsageRenewal({
			customerId,
			productId: "pro-reissue-hidden-lines",
		});
		const original = await ctx.stripeCli.invoices.retrieve(renewal.stripe_id);

		const { preview } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: renewal.id,
			preview: true,
		})) as { preview: { total: number; lines: { amount: number }[] } };
		expect(preview.lines.every((line) => line.amount !== 0)).toBe(true);

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: renewal.id,
		})) as { invoice: ApiListInvoiceV1 };

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.total).toBe(original.total);
		expect(preview.total * 100).toBe(original.total);

		const replacementLines = await ctx.stripeCli.invoices.listLineItems(
			invoice.stripe_id,
			{ limit: 100 },
		);
		expect(replacementLines.data.some((line) => line.amount === 0)).toBe(false);

		const storedRows = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [invoice.id],
		});
		expect(storedRows.length).toBeGreaterThan(0);
		expect(storedRows.every((row) => row.product_id !== null)).toBe(true);
	},
	600_000,
);

test.concurrent(
	`${chalk.yellowBright("invoices.reissue: a hidden line repriced by an update is billed")}`,
	async () => {
		const customerId = "inv-reissue-hidden-line-edit";
		const { ctx, autumnV2_3, renewal, hiddenLine } =
			await setupZeroUsageRenewal({
				customerId,
				productId: "pro-reissue-hidden-line-edit",
			});
		const original = await ctx.stripeCli.invoices.retrieve(renewal.stripe_id);

		// Autumn keeps a stored row for some $0 × 0 lines (e.g. a licensed price
		// at zero quantity); stand one up for the metered placeholder.
		const storedRows = await invoiceLineItemRepo.getByInvoiceIds({
			db: ctx.db,
			invoiceIds: [renewal.id],
		});
		const template = storedRows[0];
		expect(template).toBeDefined();
		const hiddenRowId = generateKsuid({ prefix: "invoice_li_" });
		await invoiceLineItemRepo.insertMany({
			db: ctx.db,
			lineItems: [
				{
					...template,
					id: hiddenRowId,
					created_at: Date.now(),
					amount: 0,
					amount_after_discounts: 0,
					description: hiddenLine.description ?? "",
					stripe_id: hiddenLine.id,
					stripe_invoice_item_id: null,
					stripe_subscription_item_id: null,
				},
			],
		});

		const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
			invoice_id: renewal.id,
			lines: { update: [{ id: hiddenRowId, amount: 5 }] },
		})) as { invoice: ApiListInvoiceV1 };

		const replacement = await ctx.stripeCli.invoices.retrieve(
			invoice.stripe_id,
		);
		expect(replacement.total).toBe(original.total + 500);

		const replacementLines = await ctx.stripeCli.invoices.listLineItems(
			invoice.stripe_id,
			{ limit: 100 },
		);
		const repriced = replacementLines.data.find(
			(line) => line.metadata?.autumn_reissued_from_line === hiddenLine.id,
		);
		expect(repriced?.amount).toBe(500);
	},
	600_000,
);
