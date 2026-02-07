/**
 * Legacy Attach V1 Trial - Merged Entity Tests
 *
 * Migrated from:
 * - server/tests/merged/trial/mergedTrial1.test.ts (trial anchor alignment for entities)
 * - server/tests/merged/trial/mergedTrial2.test.ts (add second entity after trial ends)
 * - server/tests/merged/trial/mergedTrial3.test.ts (upgrade to premium in merged trial state)
 *
 * Tests V1 attach behavior for trial products with entities in merged subscriptions.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Trial anchor alignment for entities
// (from mergedTrial1)
//
// Scenario:
// - Premium product with trial (7 days) + consumable Words
// - 2 entities
// - Attach Premium trial to entity 1
// - Advance clock 2 days (still in trial)
// - Preview checkout for entity 2 → next_cycle.starts_at should match entity 1's period_end
// - Attach Premium to entity 2 → should be trialing, aligned to entity 1's cycle
//
// Expected:
// - Entity 2's trial aligns with entity 1's billing cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 1: trial anchor alignment for entities")}`, async () => {
	const customerId = "legacy-trial-merged-1";

	const wordsItem = items.consumableWords();
	const premiumPrice = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	// Advance clock 2 days (still within trial)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 2).getTime(),
	});

	// Check entity 1's current period end
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	const premium1 = entity1.products.find((p: any) => p.id === premium.id);
	expect(premium1?.current_period_end).toBeDefined();
	const periodEnd = premium1!.current_period_end as number;

	// Preview checkout for entity 2 — next_cycle should align with entity 1
	const checkout = await autumnV1.checkout({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const nextCycle = checkout.next_cycle;
	expect(nextCycle?.starts_at).toBeDefined();
	expect(Math.abs((nextCycle?.starts_at ?? 0) - periodEnd)).toBeLessThanOrEqual(
		60000,
	); // 1 min tolerance

	// Attach Premium to entity 2
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	// Entity 2 should be trialing, with period_end aligned to entity 1
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2,
		productId: premium.id,
		trialEndsAt: periodEnd,
		toleranceMs: 60000,
	});
}, 120000);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Add second entity after trial ends
// (from mergedTrial2)
//
// Scenario:
// - Premium product with trial (7 days) + consumable Words
// - 2 entities
// - Attach Premium trial to entity 1
// - Advance clock 8 days (past trial end → Premium becomes active)
// - Attach Premium to entity 2 → should still work (attach + expect correct)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 2: add second entity after trial ends")}`, async () => {
	const customerId = "legacy-trial-merged-2";

	const wordsItem = items.consumableWords();
	const premiumPrice = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	// Advance clock 8 days (past the 7-day trial)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 8).getTime(),
	});

	// Attach Premium to entity 2 (after entity 1's trial has ended)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	// Entity 2 should have Premium attached
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2 as any,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
}, 120000);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade entities from pro trial to premium (not trialing after upgrade)
// (from mergedTrial3)
//
// Scenario:
// - Pro product with trial (7 days) + consumable Words
// - Premium product with trial (7 days) + consumable Words
// - 2 entities
// - Attach Pro trial to entity 1 and entity 2
// - Advance clock 8 days (past trial)
// - Upgrade entity 1 to Premium → should NOT be trialing (upgrade from active)
// - Upgrade entity 2 to Premium → should NOT be trialing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 3: upgrade entities from trial pro to premium (not trialing)")}`, async () => {
	const customerId = "legacy-trial-merged-3";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Advance clock 8 days (past the 7-day trial → Pro becomes active)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 8).getTime(),
	});

	// Upgrade entity 1 to Premium → should NOT be trialing (upgrade from active)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductNotTrialing({
		customer: entity1,
		productId: premium.id,
	});

	// Upgrade entity 2 to Premium → should NOT be trialing
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductNotTrialing({
		customer: entity2,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
}, 120000);
