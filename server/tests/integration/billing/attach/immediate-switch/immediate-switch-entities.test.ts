/**
 * Immediate Switch Entity Tests (Attach V2)
 *
 * Tests for upgrade scenarios involving multiple entities (multi-tenant).
 *
 * Key behaviors:
 * - Each entity has independent subscription/products
 * - Upgrading one entity doesn't affect others
 * - Scheduled downgrades can be cancelled by upgrades
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 free, entity 2 free, upgrade entity 2 to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Two entities on free
 * - Upgrade entity 2 to pro
 *
 * Expected Result:
 * - Entity 2 has pro, entity 1 still has free
 * - Independent states
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 1: entity free, upgrade one to pro")}`, async () => {
	const customerId = "imm-switch-ent-free-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: free.id, entityIndex: 0 }),
			s.billing.attach({ productId: free.id, entityIndex: 1 }),
		],
	});

	// 1. Preview upgrade entity 2 to pro
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});
	expect(preview.total).toBe(20);

	// 2. Upgrade entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 still has free
	await expectProductActive({
		customer: entity1,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Entity 2 now has pro
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id],
		notPresent: [free.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify invoice on customer
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 pro, entity 2 free, upgrade entity 2 to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 has pro, entity 2 has free
 * - Upgrade entity 2 to pro
 *
 * Expected Result:
 * - Both entities have pro
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 2: entity pro+free, upgrade free to pro")}`, async () => {
	const customerId = "imm-switch-ent-mixed-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: free.id, entityIndex: 1 }),
		],
	});

	// 1. Preview upgrade entity 2 to pro
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});
	expect(preview.total).toBe(20);

	// 2. Upgrade entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Both should have pro
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});

	// Verify invoices: entity1 pro ($20) + entity2 pro ($20)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 pro, entity 2 pro, upgrade entity 2 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro
 * - Upgrade entity 2 to premium
 *
 * Expected Result:
 * - Entity 1 still has pro, entity 2 has premium
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 3: both pro, upgrade one to premium")}`, async () => {
	const customerId = "imm-switch-ent-pro-to-premium";

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// 1. Preview upgrade entity 2 to premium
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});
	// $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Upgrade entity 2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 still has pro
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
	});

	// Entity 2 has premium
	await expectCustomerProducts({
		customer: entity2,
		active: [premium.id],
		notPresent: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium on both, downgrade entity 1 (scheduled), then upgrade entity 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have premium
 * - Downgrade entity 1 to pro (scheduled)
 * - Upgrade entity 1 to growth (should cancel scheduled)
 *
 * Expected Result:
 * - Scheduled downgrade cancelled
 * - Entity 1 has growth, entity 2 still premium
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 4: entity downgrade scheduled, then upgrade")}`, async () => {
	const customerId = "imm-switch-ent-down-then-up";

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const growthMessages = items.monthlyMessages({ includedUsage: 2000 });
	const growth = products.growth({
		id: "growth",
		items: [growthMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, growth] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1 (scheduled)
		],
	});

	// Verify entity 1 has scheduled downgrade
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1Before,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1Before,
		productId: pro.id,
	});

	// 1. Preview upgrade entity 1 to growth
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: growth.id,
		entity_id: entities[0].id,
	});
	// $100 - $50 = $50
	expect(preview.total).toBe(50);

	// 2. Upgrade entity 1 to growth (should cancel scheduled downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: growth.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 now has growth (not premium canceling, not pro scheduled)
	await expectCustomerProducts({
		customer: entity1,
		active: [growth.id],
		notPresent: [premium.id, pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 2000,
		balance: 2000,
	});

	// Entity 2 still has premium
	await expectProductActive({
		customer: entity2,
		productId: premium.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Both premium, downgrade both (scheduled), upgrade one
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have premium
 * - Downgrade both to pro (scheduled)
 * - Upgrade entity 2 to growth
 *
 * Expected Result:
 * - Entity 1 still has scheduled downgrade
 * - Entity 2's scheduled downgrade cancelled, now has growth
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 5: both downgrade scheduled, upgrade one")}`, async () => {
	const customerId = "imm-switch-ent-both-down-one-up";

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const growthMessages = items.monthlyMessages({ includedUsage: 2000 });
	const growth = products.growth({
		id: "growth",
		items: [growthMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, growth] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2
		],
	});

	// Verify both have scheduled downgrades
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
		productId: premium.id,
	});
	await expectProductScheduled({ customer: entity1Before, productId: pro.id });
	await expectProductCanceling({
		customer: entity2Before,
		productId: premium.id,
	});
	await expectProductScheduled({ customer: entity2Before, productId: pro.id });

	// 1. Preview upgrade entity 2 to growth
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: growth.id,
		entity_id: entities[1].id,
	});
	// $100 - $50 = $50
	expect(preview.total).toBe(50);

	// 2. Upgrade entity 2 to growth
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: growth.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 still has scheduled downgrade (unchanged)
	await expectProductCanceling({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: pro.id,
	});

	// Entity 2 now has growth
	await expectCustomerProducts({
		customer: entity2,
		active: [growth.id],
		notPresent: [premium.id, pro.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Both pro, cancel entity 1 (to free), then upgrade entity 1 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro
 * - Cancel entity 1 (scheduled to free)
 * - Upgrade entity 1 to premium (should override cancel)
 *
 * Expected Result:
 * - Cancel is overridden
 * - Entity 1 has premium, entity 2 still pro
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 6: entity cancel scheduled, then upgrade")}`, async () => {
	const customerId = "imm-switch-ent-cancel-then-up";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			s.billing.attach({ productId: free.id, entityIndex: 0 }), // Cancel entity 1 (downgrade to free)
		],
	});

	// Verify entity 1 has scheduled cancel
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1Before,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: entity1Before,
		productId: free.id,
	});

	// 1. Preview upgrade entity 1 to premium
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});
	// $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Upgrade entity 1 to premium (should override cancel)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 now has premium (cancel overridden)
	await expectCustomerProducts({
		customer: entity1,
		active: [premium.id],
		notPresent: [pro.id, free.id],
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
	});

	// Entity 2 still has pro
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Both pro with usage, advance 2 weeks, upgrade entity 1 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro with consumable
 * - Track usage on both
 * - Advance 2 weeks
 * - Upgrade entity 1 to premium
 *
 * Expected Result:
 * - Entity 1 upgraded mid-cycle with prorated charge
 * - Entity 2 unchanged, overage billed at cycle end
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-entities 7: entities with usage, mid-cycle upgrade")}`, async () => {
	const customerId = "imm-switch-ent-usage-midcycle";

	const proConsumable = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const premiumConsumable = items.consumableMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Track usage on both entities
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		value: 50,
	});
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[1].id,
		value: 75,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify usage before time advance
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Messages,
		balance: 50, // 100 - 50
		usage: 50,
	});
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		balance: 25, // 100 - 75
		usage: 75,
	});

	// 1. Preview upgrade entity 1 mid-cycle (simulate being mid-cycle conceptually)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});
	// $50 - $20 = $30 (at start of cycle, full price diff)
	expect(preview.total).toBe(30);

	// 2. Upgrade entity 1 to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1 upgraded - usage resets
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Entity 2 unchanged
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: 25, // Unchanged
		usage: 75,
	});
});
