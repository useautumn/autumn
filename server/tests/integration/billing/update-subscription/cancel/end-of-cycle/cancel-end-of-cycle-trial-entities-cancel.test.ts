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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel one entity, other still trialing")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-one";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
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

		const entity1AfterAttach = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductTrialing({
			customer: entity1AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
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
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeTrialing: true,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 10,
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
			count: 3,
			latestTotal: 20,
			latestInvoiceProductId: proTrial.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel both entities EOC")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-both";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
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

		const entity1AfterAttach = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductTrialing({
			customer: entity1AfterAttach,
			productId: proTrial.id,
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: proTrial.id,
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
			productId: proTrial.id,
		});

		await expectProductCanceling({
			customer: entity2AfterCancel,
			productId: proTrial.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeTrialing: true,
			shouldBeCanceled: true,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);

		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: proTrial.id,
		});

		await expectProductNotPresent({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
