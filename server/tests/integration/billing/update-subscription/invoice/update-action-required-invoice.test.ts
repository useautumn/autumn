import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Action Required Tests - Invoice Action Group
 *
 * Tests for action required scenarios when updating base price on existing subscription:
 * - No payment method (payment_method_required)
 * - 3DS authentication required (3ds_required)
 * - Payment failed (payment_failed)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1: INVOICE ACTION - Update base price on item
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-action: no payment method")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-action-no-pm",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.removePaymentMethod(), // Remove payment method after attach
		],
	});

	// Update with price increase - should require payment method
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	// Should return required_action with payment_method_required code
	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_method_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Features should not have changed - still original values
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Complete checkout with new payment method
	await completeInvoiceCheckout({
		url: result.payment_url!,
	});

	const customerAfterCheckout =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterCheckout,
		productId: pro.id,
	});

	// After checkout - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterCheckout,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCheckout,
		count: 2, // Initial attach + update
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("invoice-action: 3ds authentication required")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-action-3ds",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS-required card
		],
	});

	// Update with price increase - should require 3DS
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	// Should return required_action with 3ds_required code
	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Features should not have changed - still original values
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Complete 3DS authentication
	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: pro.id,
	});

	// After authentication - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 2, // Initial attach + update
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("invoice-action: payment failed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-action-fail",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }), // Switch to failing card
		],
	});

	// Update with price increase - should fail payment
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	// Should return required_action with payment_failed code
	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_failed");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Features should not have changed - still original values
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});
