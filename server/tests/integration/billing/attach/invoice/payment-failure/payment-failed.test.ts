/**
 * Attach Payment Failure Tests - Payment Failed
 *
 * Tests for attach when customer's card is declined.
 * Expected: required_action.code = "payment_failed"
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PLAN - Payment Failed
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("payment-failed 1: new plan")}`, async () => {
	const customerId = "attach-fail-new-fail";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "fail" }), s.products({ list: [pro] })],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_failed");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPGRADE - Payment Failed
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("payment-failed 2: upgrade")}`, async () => {
	const customerId = "attach-fail-upgrade-fail";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_failed");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should still have pro's balance (upgrade not applied)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF - Payment Failed
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("payment-failed 3: one-off")}`, async () => {
	const customerId = "attach-fail-oneoff-fail";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-credits",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "fail" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_failed");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();
});
