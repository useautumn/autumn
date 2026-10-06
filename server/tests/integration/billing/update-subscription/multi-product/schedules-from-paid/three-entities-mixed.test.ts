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

// Three entities premium - entity 1 downgrades to pro, entity 3 cancels and updates items
test.concurrent(`${chalk.yellowBright("schedules-p2p: 3 premium entities - downgrade e1, cancel e3, update e3 items")}`, async () => {
	const customerId = "sched-p2p-3ent-downgrade-cancel";

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
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({ productId: premium.id, entityIndex: 2 }),
		],
	});

	// Entity 1 downgrades from Premium to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Entity 3 cancels premium
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[2].id,
	});

	// Verify entity 3 is scheduled for cancellation
	const entity3AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[2].id,
	);
	await expectProductCanceling({
		customer: entity3AfterCancel,
		productId: premium.id,
	});

	// Entity 3 updates premium's items while canceling
	const newPriceItem = items.monthlyPrice({ price: 70 }); // $70/mo

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: premium.id,
		items: [consumableItem, newPriceItem],
	});

	// Verify current state:
	// Entity 1: Premium active (downgrade to pro scheduled)
	// Entity 2: Premium active
	// Entity 3: Premium canceling with new items
	const entity1Data = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	const entity3Data = await autumnV1.entities.get(customerId, entities[2].id);

	await expectProductCanceling({
		customer: entity1Data,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2Data,
		productId: premium.id,
	});
	await expectProductCanceling({
		customer: entity3Data,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After next cycle:
	// Entity 1: Pro active, Premium gone
	// Entity 2: Premium active
	// Entity 3: Premium gone (canceled)
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

	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity1AfterCycle,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity3AfterCycle,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
