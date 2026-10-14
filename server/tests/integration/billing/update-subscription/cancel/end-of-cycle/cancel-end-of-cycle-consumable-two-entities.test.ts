import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: two entities, both overage → cancel → advance")}`,
	async () => {
		const customerId = "cancel-eoc-cons-2ent";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		const entity1 = await autumnV1.entities.get(customerId, entity1Id);
		const entity2 = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductActive({ customer: entity1, productId: pro.id });
		await expectProductActive({ customer: entity2, productId: pro.id });

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity1Id,
			feature_id: TestFeature.Messages,
			value: 300,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity2Id,
			feature_id: TestFeature.Messages,
			value: 600,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entity2AfterCancel,
			productId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 70,
				}),
		});

		const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
		const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductNotPresent({
			customer: entity1Final,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity2Final,
			productId: pro.id,
		});

		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 300 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const entity2Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 600 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(entity1Overage).toBe(20);
		expect(entity2Overage).toBe(50);

		const totalOverage = entity1Overage + entity2Overage;
		expect(totalOverage).toBe(70);

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: totalOverage,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: two entities, cancel one, keep one active")}`,
	async () => {
		const customerId = "cancel-eoc-cons-2ent-1cancel";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			],
		});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity1Id,
			feature_id: TestFeature.Messages,
			value: 400,
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entity2Id,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entity2AfterCancel,
			productId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 60,
				}),
		});

		const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
		const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
		await expectProductNotPresent({
			customer: entity1Final,
			productId: pro.id,
		});
		await expectProductActive({ customer: entity2Final, productId: pro.id });

		expect(entity2Final.features[TestFeature.Messages].balance).toBe(100);

		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 400 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const entity2Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Messages, value: 200 }],
			options: { includeFixed: false, onlyArrear: true },
		});
		expect(entity1Overage).toBe(30);
		expect(entity2Overage).toBe(10);

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3,
			latestTotal: entity1Overage + entity2Overage + 20,
		});
	},
);
