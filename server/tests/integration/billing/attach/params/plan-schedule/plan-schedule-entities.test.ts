/**
 * Plan Schedule Entity Tests (Attach V2)
 *
 * Tests for plan_schedule parameter with multiple entities (merged subscriptions).
 *
 * Key behaviors:
 * - Entities can share subscriptions (merged)
 * - plan_schedule: "end_of_cycle" schedules new entity product on existing subscription's renewal
 * - plan_schedule: "immediate" on downgrade for one entity doesn't affect others
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
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
// TEST 5: e1 pro, e2 pro with plan_schedule: "end_of_cycle" (scheduled merge)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - e1 has pro ($20/mo)
 * - e2 attaches pro with plan_schedule: "end_of_cycle"
 *
 * Expected Result:
 * - e2's pro is scheduled to start at e1's renewal
 * - Same subscription (merged)
 * - subCount: 1
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-entities 5: e2 pro scheduled on e1 sub")}`, async () => {
	const customerId = "plan-sched-ent-merge";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	// Verify initial subscription for e1
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// e1 should have pro active
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1Before,
		productId: pro.id,
	});

	// e2 attaches pro with scheduled timing
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		plan_schedule: "end_of_cycle",
		redirect_mode: "if_required",
	});

	// e2 should have pro scheduled
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductScheduled({
		customer: entity2,
		productId: pro.id,
	});

	// e1 should still have pro active
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Verify single merged subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: e1 premium, e2 premium, e2 scheduled downgrade then advance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both e1 and e2 have premium ($50/mo each)
 * - e2 schedules downgrade to pro with plan_schedule: "end_of_cycle" (normal behavior)
 * - Advance test clock
 *
 * Expected Result:
 * - e1 still has premium active
 * - e2 has pro active (downgrade completed)
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-entities 6: e2 scheduled downgrade then advance")}`, async () => {
	const customerId = "plan-sched-ent-downgrade-advance";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			// e2 schedules downgrade to pro (default behavior for downgrade)
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			s.advanceToNextInvoice(),
		],
	});

	// e1 should still have premium
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});

	// e2 should have pro now (downgrade completed)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2,
		productId: premium.id,
	});

	// Verify features
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: e2 scheduled upgrade with plan_schedule override then advance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both e1 and e2 have pro ($20/mo each)
 * - e2 upgrades to premium with plan_schedule: "end_of_cycle" (override default)
 * - Advance test clock
 *
 * Expected Result:
 * - e1 still has pro active
 * - e2 has premium active (scheduled upgrade completed)
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-entities 7: e2 scheduled upgrade then advance")}`, async () => {
	const customerId = "plan-sched-ent-upgrade-eoc-advance";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			// e2 schedules upgrade to premium with plan_schedule override
			s.billing.attach({
				productId: premium.id,
				entityIndex: 1,
				planSchedule: "end_of_cycle",
			}),
			s.advanceToNextInvoice(),
		],
	});

	// e1 should still have pro
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// e2 should have premium now (scheduled upgrade completed)
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

	// Verify features
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: e2 downgrade immediate from merged subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both e1 and e2 have premium (merged subscription)
 * - e2 downgrades to pro with plan_schedule: "immediate"
 *
 * Expected Result:
 * - e2 has pro immediately
 * - e1 still has premium
 * - Credit issued for e2's unused premium time
 */
test.concurrent(`${chalk.yellowBright("plan-schedule-entities 8: e2 downgrade immediate from merged")}`, async () => {
	const customerId = "plan-sched-ent-downgrade-imm";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	// Verify both have premium
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
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2Before,
		productId: premium.id,
	});

	// Verify merged subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// e2 downgrades to pro with immediate
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		plan_schedule: "immediate",
		redirect_mode: "if_required",
	});

	// e2 should have pro immediately
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2,
		productId: premium.id,
	});

	// e1 should still have premium
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});

	// Features updated for e2
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// e1 still has premium features
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
