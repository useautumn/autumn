import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const billingUnits = 12;

test.concurrent(`${chalk.yellowBright("update-quantity: create invoice on upgrade")}`, async () => {
	const customerId = "invoicing-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
	const invoiceCountBefore = beforeUpdate.invoices?.length || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
	const invoiceCountAfter = afterUpdate.invoices?.length || 0;

	expect(invoiceCountAfter).toBeGreaterThan(invoiceCountBefore);

	const latestInvoice = afterUpdate.invoices?.[0];
	expect(latestInvoice).toBeDefined();
	expect(latestInvoice?.status).toBe("paid");
	expect(latestInvoice?.total).toBeGreaterThan(0);
});
