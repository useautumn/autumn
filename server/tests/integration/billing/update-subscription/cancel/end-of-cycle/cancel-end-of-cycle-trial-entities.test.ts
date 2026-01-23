/**
 * Cancel End-of-Cycle Trial Entities Tests
 *
 * Tests for canceling products with free trials at end of billing cycle
 * in multi-entity scenarios with merged subscriptions.
 */

import { expect, test } from "bun:test";
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
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 0: Single entity trial cancel with consumable overage - no charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1
 * - Update entity 1 to add consumable messages
 * - Track 200 messages (100 overage)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1 is removed after trial ends
 * - No overage charges (trial usage not billed)
 * - No subscription remains
 */
test(`${chalk.yellowBright("cancel trial EOC entities: single entity consumable overage not charged")}`, async () => {
	const customerId = "cancel-trial-eoc-single-ent-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Update entity to add consumable messages
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entityId,
		items: [consumableItem],
	});

	// Track 200 messages (100 included + 100 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entityId,
		value: 200,
	});

	// Cancel entity at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entityId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity is canceling
	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: proTrial.id,
	});

	// Advance past trial end
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 8,
	});

	// Verify entity is removed
	const entityAfterAdvance = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterAdvance,
		productId: proTrial.id,
	});

	// No subscription should exist
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 0,
	});

	// No paid invoice - only $0 invoice from update
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 1,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel one entity EOC, other still trialing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2 (merged subscription)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1's product should be canceling, then removed after trial ends
 * - Entity 2's product should still be trialing, then active after trial ends
 * - Invoice after trial ends should only be for 1 entity ($20)
 */
test(`${chalk.yellowBright("cancel trial EOC entities: cancel one entity, other still trialing")}`, async () => {
	const customerId = "cancel-trial-eoc-ent-one";

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

	// Verify entity 1 is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});

	// Verify entity 2 is still trialing (not affected)
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductTrialing({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Subscription should still be trialing (not fully canceled)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});

	// Advance past trial end
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

	// Verify entity 1 is removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: proTrial.id,
	});

	// Verify entity 2 is active (trial ended)
	const entity2AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// Invoice should only be for 1 entity ($20)
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1b: Cancel entity with consumable overage during trial - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Update entity 1 to add consumable messages
 * - Track 200 messages on entity 1 (100 overage)
 * - Cancel entity 1 at end of cycle
 * - Advance past trial end
 *
 * Expected Result:
 * - Entity 1's overage during trial should NOT be charged
 * - Invoice should only include entity 2's base price ($20)
 */
test(`${chalk.yellowBright("cancel trial EOC entities: consumable overage during trial not charged")}`, async () => {
	const customerId = "cancel-trial-eoc-ent-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [],
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
			],
		});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Update entity 1 to add consumable messages
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity1Id,
		items: [consumableItem],
	});

	// Track 200 messages on entity 1 (100 included + 100 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entity1Id,
		value: 200,
	});

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});

	// Verify entity 2 is still trialing
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductTrialing({
		customer: entity2AfterCancel,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Advance past trial end
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 8,
	});

	// Verify entity 1 is removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: proTrial.id,
	});

	// Verify entity 2 is active
	const entity2AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// Invoice should NOT include entity 1's overage charges
	// Only entity 2's base price ($20)
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// First two attaches create $0 invoice, third invoice is $0 from update, fourth is $20 for entity 2
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 4,
		latestTotal: 20, // Only entity 2's base price, NO overage from entity 1
		latestInvoiceProductId: proTrial.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel both entities EOC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2 (merged subscription)
 * - Cancel entity 1 at end of cycle
 * - Cancel entity 2 at end of cycle
 *
 * Expected Result:
 * - Both entities' products should be canceling
 * - Subscription should be canceling
 * - After advancing past trial end:
 *   - Both products removed
 *   - No subscription
 */
test(`${chalk.yellowBright("cancel trial EOC entities: cancel both entities EOC")}`, async () => {
	const customerId = "cancel-trial-eoc-ent-both";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
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
	});

	await expectProductTrialing({
		customer: entity2AfterAttach,
		productId: proTrial.id,
	});

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Cancel entity 2 at end of cycle
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

	// Subscription should be canceling and trialing
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: true,
	});

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify both entities' products are removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: proTrial.id,
	});

	await expectProductNotPresent({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// No subscription should exist
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel one entity, attach pro to other (next cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premiumTrial to entity 1 and entity 2
 * - Cancel entity 1 at end of cycle
 * - Attach pro to entity 2 (downgrade - scheduled for next cycle)
 *
 * Expected Result:
 * - Entity 1's premium should be canceling
 * - Entity 2's premium should be canceling with pro scheduled
 * - After advancing past trial end:
 *   - Entity 1's product is removed
 *   - Entity 2 is on pro (active)
 */
test(`${chalk.yellowBright("cancel trial EOC entities: cancel one, attach pro to other (next cycle)")}`, async () => {
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

	// Verify both entities are trialing on premium
	const entity1AfterAttach = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterAttach = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductTrialing({
		customer: entity1AfterAttach,
		productId: premiumTrial.id,
	});

	await expectProductTrialing({
		customer: entity2AfterAttach,
		productId: premiumTrial.id,
	});

	// Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: premiumTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Attach pro to entity 2 (downgrade - scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: pro.id,
	});

	// Verify entity 1's premium is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: premiumTrial.id,
	});

	// Verify entity 2's premium is canceling and pro is scheduled
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

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify entity 1's product is removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: premiumTrial.id,
	});

	// Verify entity 2 is now on pro (active)
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

	// Subscription should exist for entity 2's pro
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel entity 1, attach proTrial to entity 2 creates schedule
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1
 * - Cancel entity 1 at end of cycle
 * - Attach proTrial to entity 2
 *
 * Expected Result:
 * - Entity 1's product should be canceling
 * - Entity 2's product should be trialing (merges with existing trialing sub)
 * - After advancing past trial end:
 *   - Entity 1's product is removed
 *   - Entity 2 is on proTrial (active, no longer trialing - trial ended)
 */
test(`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1, attach proTrial to entity 2")}`, async () => {
	const customerId = "cancel-trial-eoc-ent-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, testClockId, entities, advancedTo } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
		});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify entity 1 is trialing
	const entity1AfterAttach = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductTrialing({
		customer: entity1AfterAttach,
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

	// Verify entity 1 is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});

	// Attach proTrial to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: proTrial.id,
	});

	// Verify entity 2 is trialing (merged with existing subscription)
	const entity2AfterAttach = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductTrialing({
		customer: entity2AfterAttach,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Advance past trial end
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify entity 1's product is removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: proTrial.id,
	});

	// Verify entity 2 is active (trial ended, now paying)
	const entity2AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// Not trialing anymore (trial ended)
	await expectProductNotTrialing({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// Subscription should exist for entity 2
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Should have invoice for entity 2's subscription after trial
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoices = customerAfterAdvance.invoices ?? [];
	const paidInvoice = invoices.find((inv) => inv.total > 0);
	expect(paidInvoice).toBeDefined();
	expect(paidInvoice?.total).toBe(20); // Pro price
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancel entity 1 EOC after trial ends (active billing period)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach proTrial to entity 1 and entity 2
 * - Advance past trial end (both entities now active/paying)
 * - Cancel entity 1 at end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Entity 1's product should be canceling after cancel request
 * - After advancing to next invoice:
 *   - Entity 1's product is removed
 *   - Entity 2's product is still active
 */
test(`${chalk.yellowBright("cancel trial EOC entities: cancel entity 1 EOC after trial ends")}`, async () => {
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

	// Verify both entities are now active (no longer trialing)
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

	// Cancel entity 1 at end of cycle (now in active billing period)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: proTrial.id,
	});

	// Verify entity 2 is still active (not affected)
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: proTrial.id,
	});

	// Advance to next invoice (from advancedTo + 7 days trial + ~23 days to complete month)
	// Using advanceToNextInvoice to properly advance to the billing cycle end
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: advancedTo + ms.days(12) + ms.days(30), // Trial end + 1 month
	});

	// Verify entity 1's product is removed
	const entity1AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	await expectProductNotPresent({
		customer: entity1AfterAdvance,
		productId: proTrial.id,
	});

	// Verify entity 2's product is still active
	const entity2AfterAdvance = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAdvance,
		productId: proTrial.id,
	});

	// Subscription should still exist for entity 2
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
