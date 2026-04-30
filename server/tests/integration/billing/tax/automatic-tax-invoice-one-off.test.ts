/**
 * TDD test for `automatic_tax` on one-off product invoices (Cycle 2).
 *
 * Exercises BOTH attach paths concurrently:
 *  - v1 legacy `/v1/attach` via `s.attach(...)` → handleOneOffFunction
 *  - v2 `/v1/billing.attach` via `s.billing.attach(...)` → v2 invoice helpers
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - The v1 path's `handleOneOffFunction` calls `stripeCli.invoices.create({...})`
 *    WITHOUT passing `automatic_tax: { enabled: true }` even when the org has
 *    `org.config.automatic_tax === true`.
 *  - The v2 path uses helpers in the v2 stack that may or may not pass the flag.
 *  - Result on either path: invoice.total stays at the pre-tax amount,
 *    invoice.automatic_tax.enabled is false.
 *
 * Green-success criteria (after fix):
 *  - Both paths pass `automatic_tax: { enabled: true }` when org config is on.
 *  - Stripe Tax computes 10% AU GST on the customer's $10 line item.
 *  - invoice.total = 1100 cents ($11.00).
 *
 * Why invoice.total is the primary red signal: asserting only
 * `automatic_tax.enabled` proves we sent the flag, but doesn't prove tax
 * actually landed on what the customer pays. The customer's actual complaint
 * is "the invoice total didn't include VAT" — we mirror that exactly here.
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
		// constructProduct auto-adds a $10 one-off base price for type "one_off".
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
