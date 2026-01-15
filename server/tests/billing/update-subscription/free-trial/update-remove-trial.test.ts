import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { getStripeSubscription } from "@tests/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("subscription-update: remove trial with no default payment method")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "sub-update-remove-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "success" }), // Re-attach but subscription default_payment_method stays null
		],
	});

	// 1. Verify stripe subscription.default_payment_method is null
	const { subscription: stripeSub } = await getStripeSubscription({
		customerId,
	});
	expect(stripeSub.default_payment_method).toBeNull();

	// New items for the update
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const priceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
		items: [newMessagesItem, priceItem],
	};

	// 2. Verify preview.total is correct
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(30); // $30 monthly price

	// Perform the update
	await autumnV1.subscriptions.update(updateParams);

	// 3. Verify customer invoice and feature changes
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Invoice should be correct
	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial $0 trial invoice + $30 for update
		latestTotal: 30,
	});

	// Features should reflect new items
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newMessagesItem.included_usage,
		balance: newMessagesItem.included_usage,
		usage: 0,
	});
});
