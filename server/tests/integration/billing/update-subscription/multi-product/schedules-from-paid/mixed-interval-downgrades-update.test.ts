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

test.concurrent(`${chalk.yellowBright("schedules-p2p: annual + monthly downgrades, update entity 3")}`, async () => {
	const customerId = "sched-p2p-multi-downgrade";

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const premiumAnnual = constructProduct({
		id: "premium-annual",
		items: [consumableItem],
		type: "premium",
		isAnnual: true,
		isDefault: false,
	});

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
			s.products({ list: [premiumAnnual, premium, pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({ productId: premium.id, entityIndex: 2 }),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	const newPriceItem = items.monthlyPrice({ price: 70 });
	const newConsumable = items.consumableMessages({ includedUsage: 100 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: premium.id,
		items: [newConsumable, newPriceItem],
	});

	const entity3Data = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductActive({
		customer: entity3Data,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
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
	const entity3AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[2].id,
	);

	await expectProductCanceling({
		customer: entity1AfterCycle,
		productId: premiumAnnual.id,
	});

	await expectProductNotPresent({
		customer: entity2AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: pro.id,
	});

	await expectProductActive({
		customer: entity3AfterCycle,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
