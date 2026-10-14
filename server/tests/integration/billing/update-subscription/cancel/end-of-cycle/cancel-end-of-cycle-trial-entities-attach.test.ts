import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel one, attach pro to other (next cycle)")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-downgrade";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const premiumTrial = products.premiumWithTrial({
			id: "premium-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premiumTrial, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premiumTrial.id, entityIndex: 0 }),
				s.attach({ productId: premiumTrial.id, entityIndex: 1 }),
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
			productId: premiumTrial.id,
		});

		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: premiumTrial.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entity1Id,
			product_id: premiumTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entity2Id,
			product_id: pro.id,
		});

		const entity1AfterCancel = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductCanceling({
			customer: entity1AfterCancel,
			productId: premiumTrial.id,
		});

		const entity2AfterDowngrade = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductCanceling({
			customer: entity2AfterDowngrade,
			productId: premiumTrial.id,
		});
		await expectProductScheduled({
			customer: entity2AfterDowngrade,
			productId: pro.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const entity1AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		await expectProductNotPresent({
			customer: entity1AfterAdvance,
			productId: premiumTrial.id,
		});

		const entity2AfterAdvance = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductNotPresent({
			customer: entity2AfterAdvance,
			productId: premiumTrial.id,
		});
		await expectProductActive({
			customer: entity2AfterAdvance,
			productId: pro.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1, attach proTrial to entity 2")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-attach";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [messagesItem],
			trialDays: 7,
		});

		let { autumnV1, ctx, testClockId, entities, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: proTrial.id, entityIndex: 0, timeout: 8000 }),

					s.updateSubscription({
						productId: proTrial.id,
						entityIndex: 0,
						cancelAction: "cancel_end_of_cycle",
					}),

					s.attach({ productId: proTrial.id, entityIndex: 1, timeout: 8000 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		const entity2AfterAttach = await autumnV1.entities.get(
			customerId,
			entity2Id,
		);
		await expectProductTrialing({
			customer: entity2AfterAttach,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(7),
		});

		await expectProductActive({
			customer: entity2AfterAttach,
			productId: proTrial.id,
		});

		advancedTo = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
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

		await expectProductNotTrialing({
			customer: entity2AfterAdvance,
			productId: proTrial.id,
			nowMs: advancedTo,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAdvance,
			count: 3,
			latestTotal: 20,
		});
	},
);
