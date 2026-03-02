import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─── Test 1: Cancel a specific add-on by subscription_id ───

test.concurrent(`${chalk.yellowBright("update subscription_id: cancel specific add-on by subscription_id")}`, async () => {
	const customerId = "upd-sub-id-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [messagesItem],
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [],
	});

	// Multi-attach same add-on twice with different subscription_ids
	await autumnV2_1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{ plan_id: addon.id, subscription_id: "addon-keep" },
			{ plan_id: addon.id, subscription_id: "addon-cancel" },
		],
	});

	// Cancel only the second instance using subscription_id
	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		subscription_id: "addon-cancel",
		cancel_action: "cancel_end_of_cycle",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// One should be active, one should be canceling
	const keptSub = customer.subscriptions.find((sub) => sub.id === "addon-keep");
	const canceledSub = customer.subscriptions.find(
		(sub) => sub.id === "addon-cancel",
	);

	expect(keptSub).toBeDefined();
	expect(canceledSub).toBeDefined();
	expect(keptSub!.canceled_at).toBeNull();
	expect(canceledSub!.canceled_at).not.toBeNull();

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ─── Test 2: Update quantity by subscription_id ───

test.concurrent(`${chalk.yellowBright("update subscription_id: update quantity by subscription_id")}`, async () => {
	const customerId = "upd-sub-id-quantity";
	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [prepaidItem],
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [],
	});

	// Multi-attach same add-on twice with different subscription_ids and quantities
	await autumnV2_1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{
				subscription_id: "addon-small",
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
			},
			{
				subscription_id: "addon-large",
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
		],
	});

	// Update only the "addon-small" instance to increase quantity
	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		subscription_id: "addon-small",
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	// Verify the update targeted the correct subscription
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	// Total messages balance: 300 (updated small) + 200 (large) = 500
	const messagesBalance = customer.balances[TestFeature.Messages];
	expect(messagesBalance).toBeDefined();
	expect(messagesBalance.remaining).toBe(500);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
