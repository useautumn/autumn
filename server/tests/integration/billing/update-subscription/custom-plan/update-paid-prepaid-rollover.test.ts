/**
 * Update Subscription Custom Plan — Rollover Preservation
 *
 * Regression for double-counting bug in clearExcessRollovers: an updateSubscription
 * with a custom prepaid item change must preserve any existing rollover that fits
 * within the cap (max_percentage of starting balance).
 *
 * Pre-fix: the carried-over rollover was zeroed out because the cap check saw
 * `[...fullCusEnt.rollovers, ...newRows]` where both arrays were the same in-memory
 * objects, doubling the total balance and triggering excess clearing.
 */

import { test } from "bun:test";
import {
	type ApiCustomerV5,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

test.concurrent(`${chalk.yellowBright("update-paid-prepaid-rollover: max_percentage rollover persists across price update")}`, async () => {
	const customerId = "update-prepaid-rollover-price-change";
	const rolloverConfig = {
		max_percentage: 50,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const messagesItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.1,
		rolloverConfig,
	});

	const updatedMessagesItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 1,
		price: 0.2,
		rolloverConfig,
	});

	const pro = products.pro({
		id: "pro-prepaid-rollover-update",
		items: [messagesItem],
	});

	const quantity = 1500;
	const expectedRollover = quantity / 2;
	const expectedRemaining = quantity + expectedRollover;

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
			s.advanceToNextInvoice(),
		],
	});

	const customerAfterInvoice =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterInvoice,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: 0,
		rollovers: [{ balance: expectedRollover }],
	});

	// Update subscription items (price change). Rollover must survive.
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMessagesItem],
	});

	const customerAfterUpdate =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: 0,
		rollovers: [{ balance: expectedRollover }],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
