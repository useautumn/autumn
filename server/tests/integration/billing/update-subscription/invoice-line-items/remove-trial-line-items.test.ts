import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-trial-line-items 1: remove trial multi-entity with all feature types - line items persisted")}`, async () => {
	const customerId = "trial-li-remove-multi-entity";

	const freeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });

	const basePrice = 20;
	const prepaidPrice = 10;
	const expectedTotal = 2 * (basePrice + prepaidPrice);

	const proTrial = products.proWithTrial({
		id: "pro-trial-multi-entity",
		items: [freeMessages, prepaidMessages, consumableWords],
		trialDays: 14,
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 0,
	});

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		free_trial: null,
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
		latestTotal: 60,
	});

	await timeout(3000);

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice * 2, prorated: true },
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice * 2,
				billingTiming: "in_advance",
				count: 2,
			},
		],
	});
});
