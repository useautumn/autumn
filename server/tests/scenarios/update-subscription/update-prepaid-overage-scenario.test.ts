import { test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingMethod,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Update Subscription - Prepaid Overage Scenario
 *
 * Baseline scenario for inspecting `backfill_prepaid_update`.
 * Starts with a prepaid messages plan, tracks the customer into overage,
 * then updates prepaid quantity with backfill enabled so we can inspect the
 * before/after customer feature shape.
 */

test(`${chalk.yellowBright("update-subscription: prepaid overage backfill")}`, async () => {
	const customerId = "update-prepaid-overage";
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 0,
	});

	const prepaid = products.base({
		id: "prepaid",
		items: [prepaidMessagesItem, consumableMessagesItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [
			s.billing.attach({
				productId: prepaid.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 450,
				timeout: 2000,
			}),
		],
	});

	const customerBefore =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		remaining: 0,
		breakdown: {
			[BillingMethod.Prepaid]: {
				remaining: 0,
			},
			[BillingMethod.UsageBased]: {
				usage: 150,
			},
		},
	});

	const updateParams = {
		customer_id: customerId,
		plan_id: prepaid.id,
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: 500,
			},
		],
		backfill_prepaid_update: true,
	} satisfies UpdateSubscriptionV1ParamsInput;

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		updateParams,
	);

	const customerAfter =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		remaining: 50,
		breakdown: {
			[BillingMethod.Prepaid]: {
				remaining: 50,
			},
			[BillingMethod.UsageBased]: {
				remaining: 0,
				usage: 0,
			},
		},
	});
});
