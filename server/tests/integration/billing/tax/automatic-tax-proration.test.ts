/**
 * `automatic_tax` on proration invoices (mid-cycle plan changes).
 * Stripe prorates with negative credit + positive charge lines; both must
 * be taxed for totals to balance.
 *
 * Covers v1 upgrade, v2 upgrade, and v2 immediate downgrade. (v1 downgrade
 * omitted: legacy attach auto-schedules to end-of-cycle, so no immediate
 * proration invoice to assert.)
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

async function assertProrationTaxed({
	ctx,
	stripeCusId,
	expectSubtotalSign,
}: {
	ctx: TestContext;
	stripeCusId: string;
	expectSubtotalSign: "positive" | "negative";
}) {
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCusId,
		limit: 5,
	});
	const prorationInvoice = invoices.data[0];

	expect(prorationInvoice.automatic_tax.enabled).toBe(true);

	const lines = prorationInvoice.lines.data;
	const negativeLines = lines.filter((l: Stripe.InvoiceLineItem) => l.amount < 0);
	const positiveLines = lines.filter((l: Stripe.InvoiceLineItem) => l.amount > 0);
	expect(negativeLines.length).toBeGreaterThan(0);
	expect(positiveLines.length).toBeGreaterThan(0);

	for (const line of lines) {
		expect(line.taxes).not.toBeNull();
		expect(line.taxes!.length).toBeGreaterThan(0);
	}

	if (expectSubtotalSign === "negative") {
		expect(prorationInvoice.subtotal).toBeLessThan(0);
	}

	const expectedTotal = Math.round(prorationInvoice.subtotal * 1.1);
	expect(prorationInvoice.total).toBeGreaterThanOrEqual(expectedTotal - 1);
	expect(prorationInvoice.total).toBeLessThanOrEqual(expectedTotal + 1);
}

test.concurrent(
	`${chalk.yellowBright("automatic-tax-proration (v1 legacy /v1/attach upgrade): Pro->Premium taxes BOTH credit and charge lines")}`,
	async () => {
		const customerId = "tax-prorate-v1-upgrade";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV1 } = await initScenario({
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
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [
				s.attach({ productId: "pro" }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: `premium_${customerId}`,
		});

		await assertProrationTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
			expectSubtotalSign: "positive",
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-proration (v2 /v1/billing.attach upgrade): Pro->Premium taxes BOTH credit and charge lines")}`,
	async () => {
		const customerId = "tax-prorate-v2-upgrade";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
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
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [
				s.billing.attach({ productId: "pro" }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		await assertProrationTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
			expectSubtotalSign: "positive",
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-proration (v2 /v1/billing.attach downgrade): Premium->Pro taxes BOTH credit and charge lines (subtotal < 0)")}`,
	async () => {
		const customerId = "tax-prorate-v2-downgrade";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
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
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [
				s.billing.attach({ productId: "premium" }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
			plan_schedule: "immediate",
		});

		await assertProrationTaxed({
			ctx,
			stripeCusId: customer!.processor!.id!,
			expectSubtotalSign: "negative",
		});
	},
	300_000,
);
