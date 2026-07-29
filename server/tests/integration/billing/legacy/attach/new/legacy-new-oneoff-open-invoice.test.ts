/**
 * Regression: ACH invoice.pay can resolve while the invoice is still open.
 * Autumn must not grant prepaid one-off balance then.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: legacy response shape */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	LegacyVersion,
	SuccessCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createHonoApp } from "@/initHono.js";

const request = async <T>(
	app: ReturnType<typeof createHonoApp>,
	path: string,
	init?: RequestInit,
) => {
	const res = await app.fetch(
		new Request(`http://localhost/v1${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${ctx.orgSecretKey}`,
				"Content-Type": "application/json",
				"x-api-version": LegacyVersion.v1_4.toString(),
			},
		}),
	);

	expect(res.status).toBe(200);
	return (await res.json()) as T;
};

const attachAchProcessingPaymentMethod = async (stripeCustomerId: string) => {
	const paymentMethod = await ctx.stripeCli.paymentMethods.attach(
		"pm_usBankAccount_processing",
		{
			customer: stripeCustomerId,
		},
	);
	await ctx.stripeCli.customers.update(stripeCustomerId, {
		invoice_settings: {
			default_payment_method: paymentMethod.id,
		},
	});
};

test.concurrent(`${chalk.yellowBright("legacy-oneoff: ACH open invoice pay response does not grant balance")}`, async () => {
	const customerId = "legacy-oneoff-open-invoice";
	const oneOff = products.oneOff({
		id: "one-off-open-invoice",
		items: [items.oneOffMessages({ billingUnits: 250, price: 8 })],
	});

	const { customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await attachAchProcessingPaymentMethod(customer.processor.id!);
	const app = createHonoApp();

	const attach = await request<any>(app, "/attach", {
		method: "POST",
		body: JSON.stringify({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		}),
	});

	const latestInvoice = (
		await ctx.stripeCli.invoices.list({
			customer: customer.processor.id!,
			limit: 1,
		})
	).data[0];
	expect(latestInvoice.status).toBe("open");
	expect(latestInvoice.amount_paid).toBe(0);

	expect(attach.code).toBe(SuccessCode.InvoiceActionRequired);
	expect(attach.checkout_url).toContain("invoice.stripe.com");

	const customerAfterAttach = await request<ApiCustomerV3>(
		app,
		`/customers/${customerId}?expand=invoices`,
	);

	expect(customerAfterAttach.features?.[TestFeature.Messages]?.balance ?? 0).toBe(
		0,
	);
	expect(
		customerAfterAttach.products.some((product) => product.id === oneOff.id),
	).toBe(false);
});
