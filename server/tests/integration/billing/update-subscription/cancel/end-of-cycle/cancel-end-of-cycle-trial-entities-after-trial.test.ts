import { test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1 EOC after trial ends")}`,
	async () => {
		const customerId = "cancel-trial-eoc-ent-after-trial";

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
					s.advanceTestClock({ days: 12, waitForSeconds: 30 }),
				],
			});

		const entity1Id = entities[0].id;
		const entity2Id = entities[1].id;

		const entity1AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entity1Id,
		);
		const entity2AfterTrialEnd = await autumnV1.entities.get(
			customerId,
			entity2Id,
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

		await expectProductActive({
			customer: entity2AfterTrialEnd,
			productId: proTrial.id,
		});
		await expectProductNotTrialing({
			customer: entity2AfterTrialEnd,
			productId: proTrial.id,
			nowMs: advancedTo,
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
		await expectProductActive({
			customer: entity2AfterCancel,
			productId: proTrial.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(12) + ms.days(30),
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

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);
