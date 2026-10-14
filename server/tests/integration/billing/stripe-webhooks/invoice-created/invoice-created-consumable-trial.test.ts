import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created trial: customer-level overage during trial → no charge after trial ends")}`,
	async () => {
		const customerId = "inv-trial-cus-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [consumableItem],
			trialDays: 14,
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.track({ featureId: TestFeature.Messages, value: 250 }),
				s.advanceTestClock({ days: 16 }),
			],
		});

		const customerAfterTrialEnd =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterTrialEnd,
			productId: proTrial.id,
		});

		await expectProductNotTrialing({
			customer: customerAfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterTrialEnd,
			featureId: TestFeature.Messages,
			balance: -150,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterTrialEnd,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductId: proTrial.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created trial: entity-level overage during trial → no charge after trial ends")}`,
	async () => {
		const customerId = "inv-trial-ent-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const monthlyPriceItem = items.monthlyPrice();
		const proTrial = products.base({
			id: "pro-trial",
			items: [monthlyPriceItem],
			trialDays: 14,
		});

		let { autumnV1, advancedTo, entities, ctx, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
			});

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: proTrial.id,
				entity_id: entities[0].id,
				items: [consumableItem, monthlyPriceItem],
			},
			{
				timeout: 5000,
			},
		);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
			entity_id: entities[0].id,
		});

		advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 20,
		});

		const entityId = entities[0].id;

		const entityAfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		await expectProductActive({
			customer: entityAfterTrialEnd,
			productId: proTrial.id,
		});

		await expectProductNotTrialing({
			customer: entityAfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		expectCustomerFeatureCorrect({
			customer: entityAfterTrialEnd,
			featureId: TestFeature.Messages,
			balance: -100,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductId: proTrial.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created trial: multiple entities with overage during trial → no charge after trial ends")}`,
	async () => {
		const customerId = "inv-trial-multi-ent";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [consumableItem],
			trialDays: 14,
		});

		const { autumnV1, advancedTo, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.attach({ productId: proTrial.id, entityIndex: 1, timeout: 4000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 250,
					entityIndex: 1,
				}),
				s.advanceTestClock({ days: 20 }),
			],
		});

		const entity0AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity0AfterTrialEnd,
			productId: proTrial.id,
		});
		await expectProductNotTrialing({
			customer: entity0AfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});
		expectCustomerFeatureCorrect({
			customer: entity0AfterTrialEnd,
			featureId: TestFeature.Messages,
			balance: -100,
		});

		const entity1AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity1AfterTrialEnd,
			productId: proTrial.id,
		});
		await expectProductNotTrialing({
			customer: entity1AfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
		});
		expectCustomerFeatureCorrect({
			customer: entity1AfterTrialEnd,
			featureId: TestFeature.Messages,
			balance: -150,
		});

		const customerAfterTrialEnd =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerAfterTrialEnd,
			count: 3,
			latestTotal: 40,
		});
	},
);
