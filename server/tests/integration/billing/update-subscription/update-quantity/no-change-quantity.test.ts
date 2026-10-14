import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const billingUnits = 12;

test.concurrent(`${chalk.yellowBright("update-quantity: same quantity is no-op")}`, async () => {
	const customerId = "no-change-qty-noop";

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
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
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const beforeUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const beforeFeature = beforeUpdate.features?.[TestFeature.Messages];
	const beforeInvoiceCount = beforeUpdate.invoices?.length ?? 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits }],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const afterFeature = afterUpdate.features?.[TestFeature.Messages];
	const afterInvoiceCount = afterUpdate.invoices?.length ?? 0;

	expect(afterFeature?.balance).toBe(beforeFeature?.balance);

	expect(afterInvoiceCount).toBe(beforeInvoiceCount);
});
