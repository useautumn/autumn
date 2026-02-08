/**
 * Legacy Downgrade Merged Tests — Schedule/Renew Behavior
 *
 * Migrated from:
 * - server/tests/merged/downgrade/mergedDowngrade1.test.ts (Test 1)
 * - server/tests/merged/downgrade/mergedDowngrade3.test.ts (Test 3)
 * - server/tests/merged/downgrade/mergedDowngrade5.test.ts (Test 5)
 * - server/tests/merged/downgrade/mergedDowngrade6.test.ts (Test 6)
 * - server/tests/merged/downgrade/mergedDowngrade8.test.ts (Test 7)
 *
 * Tests V1 attach downgrade/schedule behavior for entity-level merged subscriptions:
 * - Scheduled downgrades (Premium → Pro) across entities
 * - Downgrade to free product
 * - Renewing after a scheduled downgrade (cancelling the schedule)
 * - Mixed billing intervals (annual + monthly) with downgrades
 * - Changing scheduled downgrades (Growth → Free → Pro → Premium → Free)
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Downgrade 2 entities from Premium → Pro, then renew to Premium
// (from mergedDowngrade1)
//
// Ops: Premium(ent1), Premium(ent2), Pro(ent1→sched), Pro(ent2→sched),
//      Premium(ent1→renew), Premium(ent2→renew)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 1: downgrade 2 entities then renew")}`, async () => {
	const customerId = "legacy-downgrade-1";

	const wordsItem = items.consumableWords();
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	// Downgrade entity 1 to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });
	expectProductAttached({
		customer: entity1,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});
	expect(
		entity1.products.filter((p: any) => p.group === premium.group).length,
	).toBe(2);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade entity 2 to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expectProductAttached({
		customer: entity2,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Renew entity 1 back to Premium (cancels scheduled downgrade)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });
	expect(
		entity1.products.filter((p: any) => p.group === premium.group).length,
	).toBe(1);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Renew entity 2 back to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expect(
		entity2.products.filter((p: any) => p.group === premium.group).length,
	).toBe(1);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro on 2 entities, downgrade ent1 to free, upgrade ent2 to premium
// (from mergedDowngrade3)
//
// Ops: Pro(ent1), Pro(ent2), Free(ent1→sched), Premium(ent2→upgrade)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 3: pro entities, downgrade to free + upgrade to premium")}`, async () => {
	const customerId = "legacy-downgrade-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const wordsConsumable = items.consumableWords();
	const free = products.base({ id: "free", items: [wordsItem] });
	const premium = products.premium({
		id: "premium",
		items: [wordsConsumable],
	});
	const pro = products.pro({ id: "pro", items: [wordsConsumable] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Entity 1: Downgrade to Free (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: pro.id });
	expectProductAttached({
		customer: entity1,
		productId: free.id,
		status: CusProductStatus.Scheduled,
	});
	expect(
		entity1.products.filter((p: any) => p.group === premium.group).length,
	).toBe(2);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 2: Upgrade to Premium (immediate)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
		status: CusProductStatus.Active,
	});
	expect(
		entity2.products.filter((p: any) => p.group === premium.group).length,
	).toBe(1);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade both entities to free, then change ent2 to pro
// (from mergedDowngrade5)
//
// Ops: Premium(ent1), Premium(ent2), Free(ent1→sched), Free(ent2→sched),
//      Pro(ent2→replaces free schedule)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 5: downgrade to free, then change schedule to pro")}`, async () => {
	const customerId = "legacy-downgrade-5";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	// Entity 1: Downgrade to Free (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premium.id });
	expectProductAttached({
		customer: entity1,
		productId: free.id,
		status: CusProductStatus.Scheduled,
	});

	// Entity 2: Downgrade to Free (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[1].id,
	});

	let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expectProductAttached({
		customer: entity2,
		productId: free.id,
		status: CusProductStatus.Scheduled,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	// Entity 2: Change schedule from Free to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expectProductAttached({
		customer: entity2,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Multiple schedule changes on same entity
// (from mergedDowngrade6)
//
// Ops: Growth(ent1), Growth(ent2), Free(ent1→sched), Pro(ent1→replaces),
//      Premium(ent1→replaces), Free(ent1→replaces back)
// Tests that changing the scheduled product replaces the previous schedule
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 6: multiple schedule changes on same entity")}`, async () => {
	const customerId = "legacy-downgrade-6";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const growth = products.growth({ id: "growth", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free, premium, growth] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: growth.id, entityIndex: 0 }),
			s.attach({ productId: growth.id, entityIndex: 1 }),
		],
	});

	// Entity 1: Downgrade to Free (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
	});

	let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: growth.id });
	expectProductAttached({
		customer: entity1,
		productId: free.id,
		status: CusProductStatus.Scheduled,
	});

	// Entity 1: Change schedule to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: growth.id });
	expectProductAttached({
		customer: entity1,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	// Entity 1: Change schedule to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: growth.id });
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
		status: CusProductStatus.Scheduled,
	});

	// Entity 1: Change schedule back to Free
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: growth.id });
	expectProductAttached({
		customer: entity1,
		productId: free.id,
		status: CusProductStatus.Scheduled,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Downgrade mixed annual + monthly, then renew both
// (from mergedDowngrade8)
//
// Ops: PremiumAnnual(ent1), Premium(ent2), Pro(ent1→sched), Pro(ent2→sched),
//      PremiumAnnual(ent1→renew), Premium(ent2→renew)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-downgrade 7: mixed annual + monthly downgrade then renew")}`, async () => {
	const customerId = "legacy-downgrade-8";

	const wordsItem = items.consumableWords();
	const premiumAnnualItem = items.annualPrice({ price: 500 });
	const premiumAnnual = products.base({
		id: "premiumAnnual",
		items: [wordsItem, premiumAnnualItem],
	});
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, premiumAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	// Entity 1: Downgrade to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({ customer: entity1, productId: premiumAnnual.id });
	expectProductAttached({
		customer: entity1,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 2: Downgrade to Pro (scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({ customer: entity2, productId: premium.id });
	expectProductAttached({
		customer: entity2,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 1: Renew to PremiumAnnual (cancels schedule)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumAnnual.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premiumAnnual.id,
		status: CusProductStatus.Active,
	});
	expect(
		entity1.products.filter((p: any) => p.group === premium.group).length,
	).toBe(1);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 2: Renew to Premium (cancels schedule)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
		status: CusProductStatus.Active,
	});
	expect(
		entity2.products.filter((p: any) => p.group === premium.group).length,
	).toBe(1);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
