/**
 * Scheduled Switch Multi-Interval Tests (Attach V2)
 *
 * Tests for downgrades involving mixed billing intervals (annual + monthly entities).
 *
 * Key behaviors:
 * - Annual and monthly subscriptions have different cycle end dates
 * - Monthly downgrades complete after 1 month
 * - Annual downgrades complete after 1 year
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
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
// TEST 1: Entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance monthly cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium Annual ($500/year)
 * - Entity 2: Premium Monthly ($50/mo)
 * - Downgrade both to Pro (scheduled)
 * - Advance 1 month
 *
 * Expected Result:
 * - Entity 1: Still on premiumAnnual + pro scheduled (annual not ended)
 * - Entity 2: Now on pro (monthly cycle completed)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-multi-interval 1: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance monthly cycle")}`, async () => {
	const customerId = "sched-switch-multi-interval-1";

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
	const premiumAnnual = products.premium({
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
			s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }), // Annual
			s.billing.attach({ productId: premium.id, entityIndex: 1 }), // Monthly
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Schedule downgrade (annual)
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Schedule downgrade (monthly)
			s.advanceToNextInvoice(), // Advance 1 month
		],
	});

	// Verify entity 1: premiumAnnual still canceling, pro scheduled
	// Annual hasn't ended yet
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1,
		productId: premiumAnnual.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: pro.id,
	});

	// Verify entity 2: now on pro (monthly completed)
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

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, re-upgrade both
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium Annual ($500/year)
 * - Entity 2: Premium Monthly ($50/mo)
 * - Downgrade both to Pro (scheduled)
 * - Re-upgrade both to Premium/PremiumAnnual (immediate)
 *
 * Expected Result:
 * - Scheduled downgrades cancelled
 * - Both back to original products
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-multi-interval 2: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, re-upgrade both")}`, async () => {
	const customerId = "sched-switch-multi-interval-reupgrade";

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
	const premiumAnnual = products.premium({
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
			s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }), // Annual
			s.billing.attach({ productId: premium.id, entityIndex: 1 }), // Monthly
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Schedule downgrade (annual)
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Schedule downgrade (monthly)
		],
	});

	// Verify scheduled states before re-upgrade
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductCanceling({
		customer: entity1Before,
		productId: premiumAnnual.id,
	});
	await expectProductScheduled({
		customer: entity1Before,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2Before,
		productId: premium.id,
	});
	await expectProductScheduled({
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

	// Re-upgrade entity 1 back to premiumAnnual
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumAnnual.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Re-upgrade entity 2 back to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premiumAnnual active, pro no longer scheduled
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: premiumAnnual.id,
	});
	await expectProductNotPresent({
		customer: entity1After,
		productId: pro.id,
	});

	// Verify entity 2: premium active, pro no longer scheduled
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: entity2After,
		productId: pro.id,
	});

	// Verify Stripe subscription after re-upgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance full year
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium Annual ($500/year)
 * - Entity 2: Premium Monthly ($50/mo)
 * - Downgrade both to Pro (scheduled)
 * - Advance a full year
 *
 * Expected Result:
 * - Both entities now on pro (both annual and monthly cycles completed)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-multi-interval 3: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance full year")}`, async () => {
	const customerId = "sched-switch-multi-interval-fullyear";

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
	const premiumAnnual = products.premium({
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
			s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }), // Annual
			s.billing.attach({ productId: premium.id, entityIndex: 1 }), // Monthly
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Schedule downgrade (annual)
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Schedule downgrade (monthly)
			// Advance 12 months to complete annual cycle
			s.advanceTestClock({ months: 12, waitForSeconds: 30 }),
		],
	});

	// Verify both entities now on pro
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1: pro active, premiumAnnual removed (annual cycle completed)
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity1,
		productId: premiumAnnual.id,
	});

	// Entity 2: pro active, premium removed (multiple monthly cycles completed)
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2,
		productId: premium.id,
	});

	// Features at pro tier for both
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
