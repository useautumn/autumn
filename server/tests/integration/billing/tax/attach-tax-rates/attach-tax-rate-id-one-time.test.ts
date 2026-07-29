/**
 * Explicit `tax_rate_id` on one-time (non-subscription) charges must be applied
 * to the standalone Stripe invoice, matching what preview_attach returns.
 *
 * Covers two branches that share `createInvoiceForBilling`:
 *   - A one-off product attach (standalone invoice, no subscription).
 *   - An upgrade with `custom_line_items` (custom invoice lines).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach-tax-rate-id (one-off): $10 one-time + explicit 10% tax_rate_id = $11 standalone invoice")}`,
	async () => {
		const customerId = "attach-tax-rate-one-off";
		const oneOff = products.oneOff({ id: "one-off", items: [] });

		const { autumnV1, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		const taxRate = await scenarioCtx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			redirect_mode: "if_required",
			tax_rate_id: taxRate.id,
		});

		expect(result.invoice?.stripe_id).toBeDefined();

		const invoice = await scenarioCtx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);

		const expectedSubtotal = atmnToStripeAmount({
			amount: 10,
			currency: "usd",
		});
		expect(invoice.subtotal).toBe(expectedSubtotal);
		expect(invoice.total).toBe(expectedSubtotal + expectedSubtotal / 10);
		expect(invoice.total - invoice.subtotal).toBe(expectedSubtotal / 10);
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-tax-rate-id (custom_line_items): explicit 10% tax_rate_id taxes custom invoice lines")}`,
	async () => {
		const customerId = "attach-tax-rate-custom-lines";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const taxRate = await scenarioCtx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		const customLineItems = [
			{ amount: 15, description: "Custom upgrade charge" },
			{ amount: 5, description: "Setup fee" },
		];

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
			custom_line_items: customLineItems,
			tax_rate_id: taxRate.id,
		});

		expect(result.invoice?.stripe_id).toBeDefined();

		const invoice = await scenarioCtx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);

		const expectedSubtotal = atmnToStripeAmount({
			amount: 20,
			currency: "usd",
		});
		expect(invoice.subtotal).toBe(expectedSubtotal);
		expect(invoice.total).toBe(expectedSubtotal + expectedSubtotal / 10);
		expect(invoice.total - invoice.subtotal).toBe(expectedSubtotal / 10);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices?.[0]?.total).toBe(22);
	},
);
