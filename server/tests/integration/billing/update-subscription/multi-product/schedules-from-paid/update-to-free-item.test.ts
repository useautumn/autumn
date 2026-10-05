import { test } from "bun:test";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Entity 2 updates Pro's item to be free (should be removed from subscription + schedule)
test.concurrent(`${chalk.yellowBright("schedules-p2p: update to free item removes from sub + schedule")}`, async () => {
	const customerId = "sched-p2p-update-to-free";

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
		],
	});

	// Verify both entities have pro
	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1Before,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2Before,
		productId: pro.id,
	});

	// Entity 2 updates Pro's items to be free (no price items, only feature)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: pro.id,
		items: [messagesItem], // Only messages, no price - makes it free
	});

	// Entity 2's subscription should now be free (removed from paid sub)
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Data,
		productId: pro.id,
	});

	// Should only have 1 subscription (entity 1's pro)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
		entityId: entities[0].id,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Both entities should still have pro product
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
