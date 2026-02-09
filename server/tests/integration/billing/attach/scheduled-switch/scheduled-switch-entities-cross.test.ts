/**
 * Scheduled Switch Entity Cross Tests (Attach V2)
 *
 * Tests for cross-entity operations and post-cycle upgrades involving multiple entities.
 *
 * Key behaviors:
 * - Simultaneous upgrade and downgrade across different entities
 * - Post-cycle upgrades after scheduled downgrades complete
 * - Mixed billing intervals (annual + monthly) across entities
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 premium to pro, entity 2 pro to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium ($50/mo) → Pro (scheduled downgrade)
 * - Entity 2: Pro ($20/mo) → Premium (immediate upgrade)
 *
 * Expected Result:
 * - Entity 1: Premium canceling, Pro scheduled
 * - Entity 2: Premium active (immediate)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-cross 1: entity 1 premium to pro, entity 2 pro to premium")}`, async () => {
	const customerId = "sched-switch-ent-cross-1";

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }), // Entity 1 on premium
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Entity 2 on pro
		],
	});

	// Verify initial Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 1: Downgrade premium to pro (scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Entity 2: Upgrade pro to premium (immediate)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium canceling, pro scheduled
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: pro.id,
	});

	// Verify entity 2: premium active (immediate upgrade)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity2,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 pro to premium, entity 2 premium to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Pro ($20/mo) → Premium (immediate upgrade)
 * - Entity 2: Premium ($50/mo) → Pro (scheduled downgrade)
 *
 * Expected Result:
 * - Entity 1: Premium active (immediate)
 * - Entity 2: Premium canceling, Pro scheduled
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-cross 2: entity 1 pro to premium, entity 2 premium to pro")}`, async () => {
	const customerId = "sched-switch-ent-cross-2";

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Entity 1 on pro
			s.billing.attach({ productId: premium.id, entityIndex: 1 }), // Entity 2 on premium
		],
	});

	// Verify initial Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 1: Upgrade pro to premium (immediate)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Entity 2: Downgrade premium to pro (scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium active (immediate upgrade)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity1,
		productId: pro.id,
	});

	// Verify entity 2: premium canceling, pro scheduled
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium → Free (scheduled)
 * - Entity 2: Premium → Pro (scheduled)
 * - Advance cycle
 * - After downgrade completes, upgrade entity 1 back to premium
 *
 * Expected Result:
 * - After cycle: Entity 1 on free, Entity 2 on pro
 * - After upgrade: Entity 1 on premium (immediate)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-cross 3: entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium")}`, async () => {
	const customerId = "sched-switch-ent-post-cycle-upgrade";

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2
			s.advanceToNextInvoice(),
		],
	});

	// Verify state after cycle
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductActive({
		customer: entity1Before,
		productId: free.id,
	});
	await expectProductActive({
		customer: entity2Before,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Upgrade entity 1 back to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium active (immediate upgrade)
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity1After,
		productId: free.id,
	});

	// Verify Stripe subscription after upgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium Annual → Pro (scheduled)
 * - Entity 2: Premium Monthly → Pro (scheduled)
 * - Advance 1 month (monthly cycle ends)
 * - Upgrade entity 2 back to premium
 *
 * Expected Result:
 * - After cycle: Entity 1 still on annual (hasn't ended yet), Entity 2 on pro
 * - After upgrade: Entity 2 on premium
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-cross 4: entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium")}`, async () => {
	const customerId = "sched-switch-ent-annual-monthly";

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const premiumAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
	const premiumAnnualPrice = items.annualPrice({ price: 500 });
	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [premiumAnnualMessages, premiumAnnualPrice],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, premiumAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1 (annual)
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2 (monthly)
			s.advanceToNextInvoice(), // Advance 1 month
		],
	});

	// Verify entity 1: still on annual (annual hasn't ended)
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	// Entity 1's annual subscription should still be active with pro scheduled
	await expectProductCanceling({
		customer: entity1Before,
		productId: premiumAnnual.id,
	});
	await expectProductScheduled({
		customer: entity1Before,
		productId: pro.id,
	});

	// Verify entity 2: now on pro (monthly cycle completed)
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2Before,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2Before,
		productId: premium.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Upgrade entity 2 back to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Verify entity 2: premium active
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premium.id,
	});

	// Verify Stripe subscription after upgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
