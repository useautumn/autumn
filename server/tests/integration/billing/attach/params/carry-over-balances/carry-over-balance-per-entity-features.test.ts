/**
 * Carry Over Balances — Per-Entity Feature Tests
 *
 * Products with entityFeatureId — balances distributed per entity from a single
 * customer-level product. carry_over_balances creates one loose entitlement per
 * entity that has a positive remaining balance.
 *
 * Key behaviors:
 * - Each entity's remaining balance is carried independently as a loose entitlement
 * - Entities with zero/negative balance produce no loose entitlement
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Per-entity feature — balance carry over per entity
//
// Pro with per-entity messages (200 each):
//   e1: 150 used → balance=50 remaining
//   e2: 100 used → balance=100 remaining
// Upgrade to Premium (300 per entity) with carry_over_balances: { enabled: true }
// Expected:
//   e1: 300 + 50 = 350
//   e2: 300 + 100 = 400
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance-per-entity 1: per-entity remaining balances carried independently as loose entitlements")}`, async () => {
	const proMessages = items.monthlyMessages({
		includedUsage: 200,
		entityFeatureId: TestFeature.Users,
	});
	const premiumMessages = items.monthlyMessages({
		includedUsage: 300,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1, entities } = await initScenario({
		customerId: "carry-over-balance-per-entity1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach per-entity product to customer (not to each entity)
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 150, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 100,
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});

	// Verify pre-upgrade balances per entity
	const e1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: e1Before,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 150,
	});

	const e2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2Before,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 100,
	});

	// Upgrade the whole customer product, carrying over per-entity balances
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	// e1: 300 (Premium grant per entity) + 50 (loose carried) = 350
	const e1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: e1After,
		featureId: TestFeature.Messages,
		balance: 350,
		usage: 0,
	});

	// e2: 300 + 100 = 400
	const e2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: e2After,
		featureId: TestFeature.Messages,
		balance: 400,
		usage: 0,
	});

	// Customer-level totals: (350 + 400) = 750
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 750,
		usage: 0,
	});
});
