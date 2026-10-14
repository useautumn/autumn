import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const brAddress = {
	country: "BR",
	line1: "Av. Paulista 1000",
	city: "São Paulo",
	postal_code: "01310-100",
	state: "SP",
};

test.concurrent(
	`${chalk.yellowBright(
		"automatic-tax-unregistered-jurisdiction (v2 /v1/billing.attach): unregistered location fails open — sub created, tax = 0",
	)}`,
	async () => {
		const customerId = "tax-unreg-jurisdiction";
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
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: brAddress },
				}),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const stripeCusId = customer!.processor!.id!;

		const initialSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(initialSubs.data.length).toBeGreaterThan(0);
		expect(initialSubs.data[0].automatic_tax.enabled).toBe(true);
		console.log(
			`[unreg] initial pro sub: auto_tax.enabled=${initialSubs.data[0].automatic_tax.enabled}`,
		);

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		const upgradedSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(upgradedSubs.data.length).toBeGreaterThan(0);
		const upgradedSub = upgradedSubs.data[0];
		expect(upgradedSub.automatic_tax.enabled).toBe(true);
		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCusId,
			limit: 5,
		});
		expect(invoices.data.length).toBeGreaterThan(0);
		const prorationInvoice = invoices.data[0];
		expect(prorationInvoice.automatic_tax.enabled).toBe(true);
		expect(prorationInvoice.automatic_tax.status).toBe("complete");

		const totalTaxes = prorationInvoice.total_taxes ?? [];
		const sumOfTaxAmounts = totalTaxes.reduce(
			(acc, t) => acc + (t.amount ?? 0),
			0,
		);
		expect(sumOfTaxAmounts).toBe(0);

		console.log(
			`[unreg] upgrade succeeded: ` +
				`sub_auto_tax_enabled=${upgradedSub.automatic_tax.enabled} ` +
				`invoice_auto_tax_status=${prorationInvoice.automatic_tax.status} ` +
				`total_taxes=${JSON.stringify(totalTaxes)} ` +
				`sumOfTaxAmounts=${sumOfTaxAmounts}`,
		);
	},
	300_000,
);
