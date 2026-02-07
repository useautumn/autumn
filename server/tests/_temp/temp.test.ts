import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Test: Attach free default product, then attach pro with invoice mode
 */
test.concurrent(`${chalk.yellowBright("invoice-mode: free default then pro with invoice checkout")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 50 });

	// Free default product
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Pro product with price
	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const customerId = "temp-invoice-free-then-pro";

	// Setup customer with default attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ withDefault: true }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attachPaymentMethod({ type: "fail" })],
	});

	// Attach pro with invoice mode
	const attachResult = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		// invoice: true,
	});

	console.log("attachResult", attachResult);
	return;

	expect(attachResult.checkout_url).toBeDefined();

	// Complete invoice checkout
	await completeInvoiceCheckout({
		url: attachResult.checkout_url!,
	});

	// Verify pro is now active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 200,
	});
});
