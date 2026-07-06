/**
 * Scheduled Switch Per-Entity Product Tests (Attach V2)
 *
 * Tests for scheduled product switches with per-entity features (entity_feature_id).
 * Per-entity features give each entity its own balance allocation.
 *
 * Key behaviors tested:
 * - Each entity gets its own balance from the product
 * - On scheduled switch, consumable (pay-per-use) features RESET usage per entity
 * - On scheduled switch, allocated (seat-based) features CARRY OVER usage per entity
 * - Product is attached ONCE to customer, not per entity
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Premium to Pro with per-entity consumable messages (usage RESETS per entity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with per-entity consumable messages (1000 per entity, $0.10 overage)
 * - Create 2 entities
 * - Attach product ONCE to customer
 * - Track entity 1: 300 messages
 * - Track entity 2: 500 messages
 * - Schedule downgrade to Pro ($20/mo) with 500 per entity
 * - Advance to next cycle
 *
 * Expected Result:
 * - Pro active, Premium removed
 * - Entity 1: balance = 500, usage = 0 (RESET)
 * - Entity 2: balance = 500, usage = 0 (RESET)
 * - Customer total: balance = 1000 (500 * 2), usage = 0
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 1: premium to pro with per-entity consumable messages (usage resets)")}`, async () => {
	const customerId = "sched-switch-pe-cons-premium-to-pro";

	// Per-entity consumable: each entity gets 1000 messages
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users, // Makes it per-entity
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 500,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach product ONCE to customer (not per entity)
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			// Track per entity
			s.track({
				featureId: TestFeature.Messages,
				value: 300,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 500,
				entityIndex: 1,
				timeout: 2000,
			}),
			// Schedule downgrade to pro
			s.billing.attach({ productId: pro.id }),
			// Advance to next cycle
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify each entity has RESET usage (consumable features reset on scheduled switch)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 500, // Pro's per-entity included
		balance: 500, // RESET
		usage: 0, // RESET
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500, // RESET
		usage: 0, // RESET
	});

	// Customer total after reset
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000, // 500 * 2
		balance: 1000, // All reset
		usage: 0, // All reset
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
// TEST 2: Premium to Free with per-entity consumable messages + FREE allocated workflows
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with:
 *   - Per-entity consumable messages (1000 per entity) - usage RESETS
 *   - Per-entity FREE allocated workflows (10 per entity) - usage CARRIES OVER
 * - Create 2 entities
 * - Attach product ONCE to customer
 * - Track entity 1: 300 messages, 5 workflows
 * - Track entity 2: 500 messages, 8 workflows
 * - Schedule downgrade to Free with:
 *   - Per-entity consumable messages (100 per entity)
 *   - Per-entity FREE allocated workflows (2 per entity)
 * - Advance to next cycle
 *
 * Expected Result:
 * - Free active, Premium removed
 * - Entity 1:
 *   - Messages: balance = 100, usage = 0 (RESET)
 *   - Workflows: balance = 2 - 5 = -3, usage = 5 (CARRIED OVER)
 * - Entity 2:
 *   - Messages: balance = 100, usage = 0 (RESET)
 *   - Workflows: balance = 2 - 8 = -6, usage = 8 (CARRIED OVER)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 2: premium to free with per-entity consumable + FREE allocated (mixed behavior)")}`, async () => {
	const customerId = "sched-switch-pe-mixed-premium-to-free";

	// Premium: per-entity consumable messages + per-entity FREE allocated workflows
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 1000,
		entityFeatureId: TestFeature.Users,
	});
	const premiumPerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 10,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages, premiumPerEntityWorkflows],
	});

	// Free: lower per-entity limits
	const freePerEntityMessages = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const freePerEntityWorkflows = items.freeAllocatedWorkflows({
		includedUsage: 2,
		entityFeatureId: TestFeature.Users,
	});
	const free = products.base({
		id: "free",
		items: [freePerEntityMessages, freePerEntityWorkflows],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach product ONCE to customer
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			// Track messages per entity
			s.track({
				featureId: TestFeature.Messages,
				value: 300,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 500,
				entityIndex: 1,
				timeout: 2000,
			}),
			// Track workflows per entity
			s.track({
				featureId: TestFeature.Workflows,
				value: 5,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Workflows,
				value: 8,
				entityIndex: 1,
				timeout: 2000,
			}),
			// Schedule downgrade to free
			s.billing.attach({ productId: free.id }),
			// Advance to next cycle
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer,
		active: [free.id],
		notPresent: [premium.id],
	});

	// Verify entity 1 after cycle
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	// Messages: RESET (consumable)
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100, // Free's per-entity included
		balance: 100, // RESET
		usage: 0, // RESET
	});

	// Workflows: CARRIED OVER (allocated)
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Workflows,
		includedUsage: 2, // Free's per-entity included
		balance: -3, // 2 - 5 = -3 (overage, carried over)
		usage: 5, // CARRIED OVER
	});

	// Verify entity 2 after cycle
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Messages: RESET (consumable)
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100, // RESET
		usage: 0, // RESET
	});

	// Workflows: CARRIED OVER (allocated)
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Workflows,
		includedUsage: 2,
		balance: -6, // 2 - 8 = -6 (overage, carried over)
		usage: 8, // CARRIED OVER
	});

	// Verify customer total for messages (all reset)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200, // 100 * 2
		balance: 200, // All reset
		usage: 0, // All reset
	});

	// Verify customer total for workflows (all carried over)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 4, // 2 * 2
		balance: -9, // (-3) + (-6) = -9
		usage: 13, // 5 + 8
	});

	// Invoices: 1) Premium attach ($50), 2) cycle end (no charge on free)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0, // Free has no renewal charge
		latestInvoiceProductIds: [],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade with per-entity overage - billed at cycle end
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with per-entity consumable messages (100 per entity, $0.10 overage)
 * - Create 2 entities
 * - Entity 1: uses 130 messages (30 overage)
 * - Entity 2: uses 150 messages (50 overage)
 * - Schedule downgrade to Pro ($20/mo) with 50 per entity
 * - Advance to next cycle
 *
 * Expected Result:
 * - Pro active, Premium removed
 * - Total overage billed at cycle end: 30 + 50 = 80 * $0.10 = $8
 * - Invoice at cycle end: $20 (pro base) + $8 (overage) = $28
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-per-entity 3: downgrade with overage - billed at cycle end")}`, async () => {
	const customerId = "sched-switch-pe-overage-downgrade";

	// Premium: per-entity consumable with overage
	const premiumPerEntityMessages = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPerEntityMessages],
	});

	// Pro: lower per-entity limits
	const proPerEntityMessages = items.consumableMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPerEntityMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach premium
			s.billing.attach({ productId: premium.id, timeout: 4000 }),
			// Track overage per entity
			s.track({
				featureId: TestFeature.Messages,
				value: 130, // 30 overage
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 150, // 50 overage
				entityIndex: 1,
				timeout: 2000,
			}),
			// Schedule downgrade
			s.billing.attach({ productId: pro.id }),
			// Advance to next cycle
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify entities after cycle - usage RESET (consumable)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 50, // Pro's per-entity
		balance: 50, // RESET
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50, // RESET
		usage: 0,
	});

	// Invoices:
	// 1) Premium attach ($50)
	// 2) Cycle end: Pro base ($20) + overage (80 * $0.10 = $8) = $28
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 28, // $20 pro + $8 overage
	});
});
