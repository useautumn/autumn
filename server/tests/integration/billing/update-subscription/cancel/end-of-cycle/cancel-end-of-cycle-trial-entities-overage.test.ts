import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: single entity consumable overage not charged")}`,
	async () => {
		const customerId = "cancel-trial-eoc-single-ent-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [],
			trialDays: 7,
		});

		const { autumnV1, ctx, entities, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: proTrial.id,
				entity_id: entityId,
				items: [consumableItem],
			},
			{
				timeout: 5000,
			},
		);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			value: 200,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: proTrial.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 14,
		});

		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: proTrial.id,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 1,
			latestTotal: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: consumable overage during trial not charged")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-overage";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [],
			trialDays: 7,
		});

		const { autumnV1, ctx, entities, advancedTo, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: proTrial.id, entityIndex: 0 }),
					s.attach({ productId: proTrial.id, entityIndex: 1 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: proTrial.id,
			entity_id: entity1Id,
			items: [consumableItem],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entity1Id,
			value: 200,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: proTrial.id,
		});

		const entity2AfterCancel = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductTrialing({
			customer: entity2AfterCancel,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 8,
		});

		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: proTrial.id,
		});

		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 4,
			latestTotal: 20,
			latestInvoiceProductId: proTrial.id,
		});
	},
);
