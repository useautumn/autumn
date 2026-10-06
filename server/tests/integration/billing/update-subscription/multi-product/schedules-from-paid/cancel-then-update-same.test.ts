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

// Cancel entity 2, then update entity 2's items - should remain canceling
test.concurrent(`${chalk.yellowBright("schedules-p2p: cancel entity 2, update entity 2 items - remains canceling")}`, async () => {
	const customerId = "sched-p2p-cancel-update-same";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
			s.cancel({ productId: pro.id, entityIndex: 1 }), // Cancel entity 2's pro
		],
	});

	// Verify entity 2 is scheduled for cancellation
	const entity2AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Entity 2 updates pro's items (change price) while canceling
	const newPriceItem = items.monthlyPrice({ price: 30 }); // $30/mo instead of $20

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	});

	// Entity 2 should still be canceling with updated items
	const entity2AfterUpdate = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2AfterUpdate,
		productId: pro.id,
	});

	// Entity 1 should still be active
	const entity1Data = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Data,
		productId: pro.id,
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

	// Entity 1 should still have pro, entity 2 should be fully canceled
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
		productId: pro.id,
	});
	await expectProductNotPresent({
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
