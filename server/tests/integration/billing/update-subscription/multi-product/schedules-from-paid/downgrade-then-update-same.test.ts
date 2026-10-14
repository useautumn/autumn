import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

test.concurrent(`${chalk.yellowBright("schedules-p2p: downgrade entity 2 from premium, update entity 2 items - remains downgrading")}`, async () => {
	const customerId = "sched-p2p-downgrade-update-same";

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	const entity2AfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2AfterDowngrade,
		productId: premium.id,
	});

	const newPriceItem = items.monthlyPrice({ price: 60 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: premium.id,
		items: [consumableItem, newPriceItem],
	});

	const entity2AfterUpdate = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2AfterUpdate,
		productId: premium.id,
	});

	const entity1Data = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Data,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	await expectProductActive({
		customer: entity1AfterCycle,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity2AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
