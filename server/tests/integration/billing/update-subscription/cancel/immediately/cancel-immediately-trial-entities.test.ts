/**
 * Cancel Trial Immediately Entity Tests
 *
 * Tests for canceling trial products immediately in multi-entity (merged subscription) scenarios.
 * These tests verify behavior when multiple entities share a subscription during trial.
 *
 * Key behaviors:
 * - Canceling one entity doesn't affect others on the same merged subscription
 * - Subscription remains trialing as long as at least one entity is trialing
 * - Mixed cancel patterns (EOC + immediately) work correctly
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel one entity immediately - other entity still trialing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario (from mergedTrial4.test.ts):
 * - Create 2 entities
 * - Attach proWithTrial to entity 1
 * - Attach proWithTrial to entity 2 (merged subscription)
 * - Cancel entity 2's trial immediately
 *
 * Expected Result:
 * - Entity 2's product is removed
 * - Entity 1's product is still trialing
 * - Stripe subscription is still trialing (entity 1 remains)
 */
test(`${chalk.yellowBright("cancel trial immediately entity: one entity, other still trialing")}`, async () => {
	const customerId = "cancel-trial-imm-entity-1";

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
		],
	});

	// Verify both entities are trialing
	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer: entity2Before,
		productId: proTrial.id,
	});

	// Cancel entity 2's trial immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify entity 2's product is removed
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductNotPresent({
		customer: entity2After,
		productId: proTrial.id,
	});

	// Verify entity 1's product is still trialing
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: proTrial.id,
	});

	// Verify subscription is still trialing
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel both entities immediately - subscription canceled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Attach proWithTrial to entity 1
 * - Attach proWithTrial to entity 2 (merged subscription)
 * - Cancel entity 1 immediately
 * - Cancel entity 2 immediately
 *
 * Expected Result:
 * - Both products are removed
 * - Stripe subscription is canceled (no entities remain)
 */
test(`${chalk.yellowBright("cancel trial immediately entity: both entities, subscription canceled")}`, async () => {
	const customerId = "cancel-trial-imm-entity-2";

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
		],
	});

	// Cancel entity 1 immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify entity 1's product is removed, entity 2 still trialing
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotPresent({
		customer: entity1After,
		productId: proTrial.id,
	});

	const entity2Mid = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2Mid,
		productId: proTrial.id,
	});

	// Cancel entity 2 immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify entity 2's product is also removed
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductNotPresent({
		customer: entity2After,
		productId: proTrial.id,
	});

	// Verify subscription is canceled
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Mixed cancel - EOC then immediately on 3 entities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario (from mergedTrial5.test.ts):
 * - Create 3 entities
 * - Attach proWithTrial to all 3 entities (merged subscription)
 * - Cancel entity 2 at end of cycle
 * - Cancel entity 3 immediately
 * - Cancel entity 1 at end of cycle
 *
 * Expected Result:
 * - Entity 3 is removed immediately
 * - Entities 1 and 2 are canceling but still trialing
 * - Subscription is trialing but scheduled to cancel
 */
test(`${chalk.yellowBright("cancel trial immediately entity: mixed EOC + immediately on 3 entities")}`, async () => {
	const customerId = "cancel-trial-imm-entity-3";

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
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
			s.attach({ productId: proTrial.id, entityIndex: 2 }),
		],
	});

	// Verify all 3 entities are trialing
	for (let i = 0; i < 3; i++) {
		const entity = await autumnV1.entities.get(customerId, entities[i].id);
		await expectProductTrialing({
			customer: entity,
			productId: proTrial.id,
		});
	}

	// Cancel entity 2 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify subscription still trialing
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});

	// Cancel entity 3 immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify entity 3 is removed
	const entity3After = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductNotPresent({
		customer: entity3After,
		productId: proTrial.id,
	});

	// Verify subscription still trialing (entities 1 and 2 remain)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify subscription is trialing but canceled (all remaining entities are EOC canceling)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel immediately then re-attach on same entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 1 entity
 * - Attach proWithTrial to entity
 * - Cancel immediately
 * - Re-attach proWithTrial to same entity
 *
 * Expected Result:
 * - After cancel: product removed
 * - After re-attach: product active (not trialing - trial already used)
 * - Full price invoice created
 */
test(`${chalk.yellowBright("cancel trial immediately entity: cancel then re-attach same entity")}`, async () => {
	const customerId = "cancel-trial-imm-entity-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	// Verify entity is trialing
	const entityBefore = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entityBefore,
		productId: proTrial.id,
	});

	// Cancel immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify product is removed
	const entityAfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: proTrial.id,
	});

	// Re-attach proWithTrial
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
	});

	// Verify product is ACTIVE (not trialing - trial already used)
	const entityAfterReattach = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);

	const product = entityAfterReattach.products.find(
		(p) => p.id === proTrial.id,
	);
	expect(product).toBeDefined();
	expect(product?.status).toBe(CusProductStatus.Active);

	// Customer should have 2 invoices: $0 (trial) + $20 (full price)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.invoices?.length).toBe(2);
	expect(customer.invoices?.[0].total).toBe(20); // Latest is full price
});
