import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Remove Trial Error Tests
 *
 * Tests that verify subscription update fails correctly and customer state
 * remains unchanged when payment cannot be processed.
 *
 * Scenarios:
 * - No payment method (payment_method_required)
 * - 3DS authentication required (3ds_required)
 * - Payment failed (payment_failed)
 */

test.concurrent(`${chalk.yellowBright("remove-trial-error: no payment method")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "remove-trial-no-pm",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.removePaymentMethod(), // Remove payment method
		],
	});

	// Remove trial - should fail with payment_method_required error
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be trialing (update deferred)
	const product = customer.products?.find((p) => p.id === proTrial.id);
	expect(product?.status).toBe("trialing");

	// Features should not have changed
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});

test.concurrent(`${chalk.yellowBright("remove-trial-error: 3ds authentication required")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "remove-trial-3ds",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS-required card
		],
	});

	// Remove trial - should fail with 3ds_required error
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be trialing (update deferred)
	const product = customer.products?.find((p) => p.id === proTrial.id);
	expect(product?.status).toBe("trialing");

	// Features should not have changed
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});

test.concurrent(`${chalk.yellowBright("remove-trial-error: payment failed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		items: [messagesItem, priceItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "remove-trial-fail",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }), // Switch to failing card
		],
	});

	// Update messages - should fail with payment_failed error
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [newMessagesItem, priceItem],
		free_trial: null,
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be active (update deferred)
	const product = customer.products?.find((p) => p.id === proTrial.id);
	expect(product?.status).toBe("trialing");

	// Features should not have changed - still original values
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});
