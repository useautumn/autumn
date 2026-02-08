/**
 * Immediate Switch Per-Entity Feature Tests (Attach V2)
 *
 * Tests for upgrade scenarios with per-entity features (entityFeatureId).
 * Per-entity features give each entity its own balance allocation from a
 * single customer-level product.
 *
 * Key behaviors tested:
 * - Consumable features RESET usage on upgrade (same product)
 * - Allocated (FREE) features CARRY OVER usage on upgrade (same product)
 * - Per-entity with overage mid-cycle - is overage billed?
 * - Upgrade from entity-level product to per-entity product
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with per-entity consumable + allocated features (mixed behavior)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with:
 *   - Per-entity consumable messages (500 per entity) - usage RESETS on upgrade
 *   - Per-entity FREE allocated workflows (10 per entity) - usage CARRIES OVER on upgrade
 * - Create 2 entities
 * - Track on entity 1: 200 messages, 5 workflows
 * - Track on entity 2: 300 messages, 8 workflows
 * - Upgrade to Premium ($50/mo) with:
 *   - Per-entity consumable messages (1000 per entity)
 *   - Per-entity FREE allocated workflows (20 per entity)
 *
 * Expected Result:
 * - Premium is active, Pro is removed
 * - Entity 1:
 *   - Messages: balance = 1000, usage = 0 (RESET)
 *   - Workflows: balance = 20 - 5 = 15, usage = 5 (CARRIED OVER)
 * - Entity 2:
 *   - Messages: balance = 1000, usage = 0 (RESET)
 *   - Workflows: balance = 20 - 8 = 12, usage = 8 (CARRIED OVER)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-per-entity 1: upgrade with consumable RESETS, allocated CARRIES OVER")}`, async () => {
	const customerId = "imm-switch-pe-mixed-upgrade";

	// Pro: per-entity consumable messages + per-entity FREE allocated workflows
	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const proPerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 10,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages, proPerEntityWorkflows],
	});

	// Premium: higher per-entity limits
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const premiumPerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 20,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages, premiumPerEntityWorkflows],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach per-entity product to customer (NOT to each entity)
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			// Track on entities
			s.track({
				featureId: TestFeature.Messages,
				value: 200,
				entityIndex: 0,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 300,
				entityIndex: 1,
			}),
			s.track({
				featureId: TestFeature.Workflows,
				value: 5,
				entityIndex: 0,
			}),
			s.track({
				featureId: TestFeature.Workflows,
				value: 8,
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});

	// Verify entity balances before upgrade
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 300, // 500 - 200
		usage: 200,
	});
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Workflows,
		includedUsage: 10,
		balance: 5, // 10 - 5
		usage: 5,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 200, // 500 - 300
		usage: 300,
	});
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Workflows,
		includedUsage: 10,
		balance: 2, // 10 - 8
		usage: 8,
	});

	// 1. Preview upgrade to premium
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Upgrade to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify entity 1 after upgrade
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	// Messages: RESET (consumable)
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000, // RESET
		usage: 0, // RESET
	});
	// Workflows: CARRIED OVER (allocated)
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Workflows,
		includedUsage: 20,
		balance: 15, // 20 - 5 (carried over)
		usage: 5, // CARRIED OVER
	});

	// Verify entity 2 after upgrade
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	// Messages: RESET (consumable)
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000, // RESET
		usage: 0, // RESET
	});
	// Workflows: CARRIED OVER (allocated)
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Workflows,
		includedUsage: 20,
		balance: 12, // 20 - 8 (carried over)
		usage: 8, // CARRIED OVER
	});

	// Verify customer totals
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 2000, // 1000 * 2
		balance: 2000, // All reset
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 40, // 20 * 2
		balance: 27, // 15 + 12
		usage: 13, // 5 + 8
	});

	// Invoices: Pro ($20) + Upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade per-entity with overage mid-cycle - overage billed immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with per-entity consumable messages (100 per entity, $0.10/overage)
 * - Create 2 entities
 * - Track overage: entity 1 uses 150 (50 overage), entity 2 uses 200 (100 overage)
 * - Upgrade to Premium ($50/mo) with 500 per entity
 *
 * Expected Result:
 * - Premium is active
 * - Overage from cycle is billed in upgrade invoice: 50 + 100 = 150 * $0.10 = $15
 * - Total invoice: $30 (upgrade diff) + $15 (overage) = $45
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-per-entity 2: upgrade with overage mid-cycle - overage billed")}`, async () => {
	const customerId = "imm-switch-pe-overage-mid-cycle";

	// Pro: per-entity consumable with overage
	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages],
	});

	// Premium: higher per-entity limits
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach per-entity product to customer
			s.billing.attach({ productId: pro.id }),
			// Track overage on entities
			s.track({
				featureId: TestFeature.Messages,
				value: 150, // 50 overage
				entityIndex: 0,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 200, // 100 overage
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});

	// Verify overage before upgrade
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50 overage
		usage: 150,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -100, // 100 - 200 = -100 overage
		usage: 200,
	});

	// 1. Preview upgrade to premium
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Expected: $30 (upgrade diff) + $15 (overage: 150 * $0.10) = $45
	expect(preview.total).toBe(45);

	// 2. Upgrade to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify entities after upgrade - usage reset
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // RESET
		usage: 0, // RESET
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // RESET
		usage: 0, // RESET
	});

	// Invoices: Pro ($20) + Upgrade with overage ($45)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 45, // $30 upgrade + $15 overage
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity-level product + per-entity product coexistence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 has its own Pro product ($20/mo, 500 messages) attached at entity-level
 * - Add customer-level per-entity Premium product ($50/mo, 1000 messages per entity)
 * - Both should coexist (different scopes: entity-level vs customer-level per-entity)
 *
 * Expected Result:
 * - Both products are active
 * - Entity 1 gets: 500 (entity-level) + 1000 (per-entity) = 1500 messages
 * - Entity 2 gets: 1000 (per-entity only)
 * - Customer total: 1500 + 1000 = 2500
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-per-entity 3: entity-level product + per-entity product coexist")}`, async () => {
	const customerId = "imm-switch-pe-entity-level-coexist";

	// Pro: entity-level product (NOT per-entity)
	const proMessages = items.consumableMessages({
		includedUsage: 500,
		// No entityFeatureId = regular customer/entity-level product
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	// Premium: per-entity product
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach Pro at entity-level to entity 1 only
			s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),
			// Attach Premium as per-entity product to customer (all entities get allocation)
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both products should be active
	await expectCustomerProducts({
		customer,
		active: [pro.id, premium.id],
	});

	// Verify entity 1: has BOTH entity-level Pro + per-entity Premium
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	// Entity 1 should have Pro active at entity level
	expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Entity 1 messages: 500 (entity-level Pro) + 1000 (per-entity Premium) = 1500
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 1500, // 500 + 1000
		balance: 1500,
		usage: 0,
	});

	// Verify entity 2: has ONLY per-entity Premium (no entity-level product)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 2 messages: 1000 (per-entity Premium only)
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify customer totals: 1500 (entity 1) + 1000 (entity 2) = 2500
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 2500, // 500 + 1000 + 1000
		balance: 2500,
		usage: 0,
	});

	// Invoices: Pro at entity-level ($20) + Premium per-entity ($50) = 2 invoices
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50, // Premium invoice
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
