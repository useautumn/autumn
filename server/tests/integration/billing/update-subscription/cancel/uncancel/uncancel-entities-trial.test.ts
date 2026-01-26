/**
 * Uncancel Entities Trial Tests
 *
 * Tests for uncanceling entity-scoped products with free trials.
 * Covers scenarios during trial period and after trial ends.
 */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// DURING TRIAL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: During trial - Entity 1 canceling, Entity 2 trialing -> Uncancel entity 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Cancel entity 1 at end of cycle
 * - Uncancel entity 1
 *
 * Expected Result:
 * - Both entities should be trialing after uncancel
 * - Subscription should still be trialing
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: entity 1 canceling, entity 2 trialing -> uncancel entity 1")}`, async () => {
	const customerId = "uncancel-trial-ent-one-cancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
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

	// Verify both entities are trialing
	const entity1AfterAttach = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterAttach = await autumnV1.entities.get(customerId, entity2Id);

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

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling, entity 2 is still trialing
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductTrialing({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Uncancel entity 1

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify both entities are trialing
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductTrialing({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});
	await expectProductTrialing({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Subscription should still be trialing
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: During trial - Both entities canceling -> Uncancel entity 1 only
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Cancel both entities at end of cycle
 * - Uncancel entity 1 only
 *
 * Expected Result:
 * - Entity 1 should be trialing
 * - Entity 2 should still be canceling
 * - Subscription should be trialing (not fully canceled)
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: both canceling -> uncancel entity 1 only")}`, async () => {
	const customerId = "uncancel-trial-ent-both-cancel-one";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
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

	// Cancel both entities at end of cycle
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

	// Verify both entities are canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Uncancel entity 1 only
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify entity 1 is trialing, entity 2 still canceling
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductTrialing({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});
	await expectProductCanceling({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
	});

	// Subscription should be trialing (not fully canceled anymore)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: During trial - Both entities canceling -> Uncancel both
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Cancel both entities at end of cycle
 * - Uncancel both entities
 *
 * Expected Result:
 * - Both entities should be trialing
 * - Subscription should be trialing (not canceled)
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: both canceling -> uncancel both")}`, async () => {
	const customerId = "uncancel-trial-ent-both-cancel-both";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
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

	// Cancel both entities at end of cycle
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

	// Verify both entities are canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Subscription should be trialing AND canceling
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: true,
	});

	// Uncancel both entities
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify both entities are trialing
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductTrialing({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});
	await expectProductTrialing({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Subscription should be trialing and NOT canceled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// AFTER TRIAL ENDS SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: After trial - Entity 1 canceling, Entity 2 active -> Uncancel entity 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Advance past trial end (both entities now active/paying)
 * - Cancel entity 1 at end of cycle
 * - Uncancel entity 1
 *
 * Expected Result:
 * - Both entities should be active after uncancel
 * - Subscription should not be canceled
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: after trial - entity 1 canceling, entity 2 active -> uncancel entity 1")}`, async () => {
	const customerId = "uncancel-trial-ent-after-one";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
			s.advanceTestClock({ days: 8 }), // Past trial end
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities are active (no longer trialing)
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

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling, entity 2 is active
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Uncancel entity 1
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify both entities are active
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
	});

	// Subscription should not be canceled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: After trial - Both entities canceling -> Uncancel entity 1 only
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Advance past trial end (both entities now active/paying)
 * - Cancel both entities at end of cycle
 * - Uncancel entity 1 only
 *
 * Expected Result:
 * - Entity 1 should be active
 * - Entity 2 should still be canceling
 * - Subscription should not be fully canceled
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: after trial - both canceling -> uncancel entity 1 only")}`, async () => {
	const customerId = "uncancel-trial-ent-after-both-one";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
			s.advanceTestClock({ days: 8 }), // Past trial end
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities are active (no longer trialing)
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
	await expectProductActive({
		customer: entity2AfterTrialEnd,
		productId: proTrial.id,
	});

	// Cancel both entities at end of cycle
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

	// Verify both entities are canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Uncancel entity 1 only
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify entity 1 is active, entity 2 still canceling
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
	});
	await expectProductCanceling({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
	});

	// Subscription should not be fully canceled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: After trial - Both entities canceling -> Uncancel both
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Advance past trial end (both entities now active/paying)
 * - Cancel both entities at end of cycle
 * - Uncancel both entities
 *
 * Expected Result:
 * - Both entities should be active
 * - Subscription should not be canceled
 */
test.concurrent(`${chalk.yellowBright("uncancel trial entities: after trial - both canceling -> uncancel both")}`, async () => {
	const customerId = "uncancel-trial-ent-after-both";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
			s.advanceTestClock({ days: 8 }), // Past trial end
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities are active (no longer trialing)
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
	await expectProductActive({
		customer: entity2AfterTrialEnd,
		productId: proTrial.id,
	});

	// Cancel both entities at end of cycle
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

	// Verify both entities are canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Subscription should be canceled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Uncancel both entities
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	// Verify both entities are active
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: proTrial.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: proTrial.id,
	});

	// Subscription should not be canceled
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
