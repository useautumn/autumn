/**
 * `automatic_tax` on one-off product invoices, both v1 (handleOneOffFunction)
 * and v2 (v2 invoice helpers). Asserts invoice.total = 1100 ($10 + 10% AU GST)
 * — checking total (not just `enabled`) catches cases where the flag is set
 * but tax didn't actually land.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

test.concurrent(
	`${chalk.yellowBright("automatic-tax-invoice-one-off (v1 legacy /v1/attach): $10 + AU GST = $11")}`,
	async () => {
		const customerId = "tax-one-off-v1";
		// `oneOff` auto-adds a $10 base price.
		const oneOffProd = products.oneOff({ id: "oneOff", items: [] });

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [oneOffProd] }),
			],
			actions: [s.attach({ productId: "oneOff" })],
		});

		const stripeCusId = customer!.processor!.id!;
		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(invoices.data.length).toBeGreaterThan(0);
		const invoice = invoices.data[0];

		expect(invoice.total).toBe(1100);
		expect(invoice.automatic_tax.enabled).toBe(true);
		expect(invoice.subtotal).toBe(1000);
		expect(invoice.total - invoice.subtotal).toBe(100);
	},
	240_000,
);

test.concurrent(
	`${chalk.yellowBright("automatic-tax-invoice-one-off (v2 /v1/billing.attach): $10 + AU GST = $11")}`,
	async () => {
		const customerId = "tax-one-off-v2";
		const oneOffProd = products.oneOff({ id: "oneOff", items: [] });

		const { ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress },
				}),
				s.products({ list: [oneOffProd] }),
			],
			actions: [s.billing.attach({ productId: "oneOff" })],
		});

		const stripeCusId = customer!.processor!.id!;
		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(invoices.data.length).toBeGreaterThan(0);
		const invoice = invoices.data[0];

		expect(invoice.total).toBe(1100);
		expect(invoice.automatic_tax.enabled).toBe(true);
		expect(invoice.subtotal).toBe(1000);
		expect(invoice.total - invoice.subtotal).toBe(100);
	},
	240_000,
);
