import { expect, test } from "bun:test";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Schedules + Paid Products Tests
 *
 * Tests update subscription behavior on entities with existing paid subscriptions
 * and how scheduled changes interact with item updates on other entities.
 */

// Test 1: Entity 1 Pro cancels, Entity 2 updates Pro's items
test.concurrent(`${chalk.yellowBright("schedules-p2p: cancel entity 1, update entity 2 items")}`, async () => {
	const customerId = "sched-p2p-cancel-update";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "pro", entityIndex: 1 }),
			s.cancel({ productId: "pro", entityIndex: 0 }), // Cancel entity 1's pro
		],
	});

	// Verify entity 1 is scheduled for cancellation
	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity1Product = entity1AfterCancel.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	expect(entity1Product?.canceled_at).toBeDefined();

	// Entity 2 updates pro's items (change price)
	const newPriceItem = items.monthlyPrice({ price: 30 }); // $30/mo instead of $20

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `${customerId}_pro`,
		items: [messagesItem, newPriceItem],
	});

	// Verify entity 2 has updated items
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	const entity2Product = entity2Data.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	expect(entity2Product).toBeDefined();

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

	// Entity 1 should be fully canceled, entity 2 should still have pro
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	const entity1ProAfter = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	const entity2ProAfter = entity2AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);

	expect(entity1ProAfter).toBeUndefined();
	expect(entity2ProAfter).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// Test 2: Entity 1 Premium downgrades to Pro, Entity 2 updates Premium items
test.concurrent(`${chalk.yellowBright("schedules-p2p: downgrade entity 1, update entity 2 items")}`, async () => {
	const customerId = "sched-p2p-downgrade-update";

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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
		],
	});

	// Entity 1 downgrades from Premium to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${customerId}_pro`,
		entity_id: entities[0].id,
	});

	// Verify entity 1 has scheduled downgrade
	const entity1AfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	console.log(
		"Entity 1 products after downgrade:",
		entity1AfterDowngrade.products,
	);

	// Entity 2 updates Premium items to different price
	const newPriceItem = items.monthlyPrice({ price: 60 }); // $60/mo

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `${customerId}_premium`,
		items: [consumableItem, newPriceItem],
	});

	// Verify entity 2's premium still active with new price
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	const entity2Premium = entity2Data.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	expect(entity2Premium).toBeDefined();

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

	// Entity 1: Premium gone, Pro active
	// Entity 2: Premium with updated items
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	const entity1Premium = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	const entity1Pro = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	const entity2PremiumAfter = entity2AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);

	expect(entity1Premium).toBeUndefined();
	expect(entity1Pro).toBeDefined();
	expect(entity2PremiumAfter).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// Test 3: Three entities - entity 1 annual downgrade, entity 2 monthly downgrade, entity 3 updates items
test.concurrent(`${chalk.yellowBright("schedules-p2p: annual + monthly downgrades, update entity 3")}`, async () => {
	const customerId = "sched-p2p-multi-downgrade";

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium annual ($500/yr)
	const premiumAnnual = constructProduct({
		id: "premium-annual",
		items: [consumableItem],
		type: "premium",
		isAnnual: true,
		isDefault: false,
	});

	// Premium monthly ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	// Pro monthly ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumAnnual, premium, pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.attach({ productId: "premium-annual", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
			s.attach({ productId: "premium", entityIndex: 2 }),
		],
	});

	// Entity 1 downgrades from Premium Annual to Pro (scheduled for end of annual period)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${customerId}_pro`,
		entity_id: entities[0].id,
	});

	// Entity 2 downgrades from Premium Monthly to Pro (scheduled for end of month)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${customerId}_pro`,
		entity_id: entities[1].id,
	});

	// Entity 3 updates Premium items to different price
	const newPriceItem = items.monthlyPrice({ price: 70 }); // $70/mo
	const newConsumable = items.consumableMessages({ includedUsage: 100 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: `${customerId}_premium`,
		items: [newConsumable, newPriceItem],
	});

	// Verify entity 3's premium still active
	const entity3Data = await autumnV1.entities.get(customerId, entities[2].id);
	const entity3Premium = entity3Data.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	expect(entity3Premium).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next billing cycle (monthly entities should downgrade)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After monthly cycle:
	// Entity 1: Still on Premium Annual (annual hasn't ended yet)
	// Entity 2: Now on Pro (monthly downgrade completed)
	// Entity 3: Still on Premium with updated items
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

	// Entity 1 should still have premium-annual (annual cycle not over)
	const entity1PremiumAnnual = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium-annual`,
	);
	expect(entity1PremiumAnnual).toBeDefined();

	// Entity 2 should be on pro now
	const entity2Premium = entity2AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	const entity2Pro = entity2AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	expect(entity2Premium).toBeUndefined();
	expect(entity2Pro).toBeDefined();

	// Entity 3 should still have premium
	const entity3PremiumAfter = entity3AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	expect(entity3PremiumAfter).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Test 4: Entity 2 updates Pro's item to be free (should be removed from subscription + schedule)
test.concurrent(`${chalk.yellowBright("schedules-p2p: update to free item removes from sub + schedule")}`, async () => {
	const customerId = "sched-p2p-update-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "pro", entityIndex: 1 }),
		],
	});

	// Verify both entities have pro
	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	expect(
		entity1Before.products?.find(
			(p: { id?: string }) => p.id === `${customerId}_pro`,
		),
	).toBeDefined();
	expect(
		entity2Before.products?.find(
			(p: { id?: string }) => p.id === `${customerId}_pro`,
		),
	).toBeDefined();

	// Entity 2 updates Pro's items to be free (no price items, only feature)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `${customerId}_pro`,
		items: [messagesItem], // Only messages, no price - makes it free
	});

	// Entity 2's subscription should now be free (removed from paid sub)
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	const entity2Product = entity2Data.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	expect(entity2Product).toBeDefined();

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

	expect(
		entity1AfterCycle.products?.find(
			(p: { id?: string }) => p.id === `${customerId}_pro`,
		),
	).toBeDefined();
	expect(
		entity2AfterCycle.products?.find(
			(p: { id?: string }) => p.id === `${customerId}_pro`,
		),
	).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// Test 5: Entity 1 downgrades, Entity 2 updates to free (replaces both sub + schedule items)
test.concurrent(`${chalk.yellowBright("schedules-p2p: downgrade + update to free replaces sub + schedule")}`, async () => {
	const customerId = "sched-p2p-downgrade-free";

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium monthly ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	// Pro monthly ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
		],
	});

	// Entity 1 downgrades from Premium to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: `${customerId}_pro`,
		entity_id: entities[0].id,
	});

	// Verify entity 1 has scheduled downgrade
	const entity1AfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	console.log(
		"Entity 1 products after downgrade:",
		entity1AfterDowngrade.products,
	);

	// Entity 2 updates Premium to be free (no price, only feature item)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `${customerId}_premium`,
		items: [consumableItem], // Only consumable, no base price - makes it free
	});

	// Entity 2's subscription should now be free
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);
	const entity2Premium = entity2Data.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	expect(entity2Premium).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[0].id,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Entity 1: Premium gone, Pro active
	// Entity 2: Premium still active but free
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	const entity1Premium = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);
	const entity1Pro = entity1AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_pro`,
	);
	const entity2PremiumAfter = entity2AfterCycle.products?.find(
		(p: { id?: string }) => p.id === `${customerId}_premium`,
	);

	expect(entity1Premium).toBeUndefined();
	expect(entity1Pro).toBeDefined();
	expect(entity2PremiumAfter).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
