/**
 * Legacy New + Merged Subscription Tests
 *
 * Migrated from:
 * - server/tests/merged/add/mergedAdd1.test.ts (merged subs with track + invoice)
 * - server/tests/merged/add/mergedAdd3.test.ts (scheduled downgrade with 3 entities)
 *
 * Tests V1 attach (s.attach) behavior for:
 * - Attaching same product to multiple entities (merged into single Stripe subscription)
 * - Tracking usage per entity and verifying end-of-cycle invoice totals
 * - Scheduled downgrades across entities
 */

import { test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Merged subs with consumable track + invoice verification
// (from mergedAdd1)
//
// Scenario:
// - Pro product with consumable Words item ($0.05/word)
// - 2 entities, attach Pro to both (merged into single Stripe sub)
// - Track 110k words on entity 1, 310k words on entity 2
// - Advance to next invoice, verify total = base*2 + usage charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-new-merged 1: merged subs with track and invoice")}`, async () => {
	const customerId = "legacy-new-merged-1";

	const wordsItem = items.consumableWords();
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const value1 = 110000;
	const value2 = 310000;
	const values = [value1, value2];

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			s.track({
				featureId: TestFeature.Words,
				value: value1,
				entityIndex: 0,
				timeout: 3000,
			}),
			s.track({
				featureId: TestFeature.Words,
				value: value2,
				entityIndex: 1,
				timeout: 3000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Verify sub is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Calculate expected usage totals for each entity
	let usageTotal = 0;
	for (let i = 0; i < 2; i++) {
		const expectedTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [{ featureId: TestFeature.Words, value: values[i] }],
			onlyIncludeUsage: true,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
		usageTotal += expectedTotal;
	}

	const basePrice = getBasePrice({ product: pro });

	// Invoice total = base price * 2 entities + usage charges
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: basePrice * 2 + usageTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Scheduled downgrade with 3 entities
// (from mergedAdd3)
//
// Scenario:
// - Premium ($50) and Pro ($20) products with Words feature
// - 3 entities
// - Attach Premium to entity 1, Premium to entity 2
// - Downgrade entity 1 from Premium to Pro (scheduled)
// - Attach Premium to entity 3
//
// Expected per-entity states:
// - Entity 1: Premium (active, canceling) + Pro (scheduled)
// - Entity 2: Premium (active)
// - Entity 3: Premium (active)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-new-merged 2: scheduled downgrade with 3 entities")}`, async () => {
	const customerId = "legacy-new-merged-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach Premium to entity 1
			s.attach({ productId: premium.id, entityIndex: 0 }),
			// Attach Premium to entity 2
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	// Verify entity 1 has Premium active
	let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Verify entity 2 has Premium active
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Downgrade entity 1 from Premium to Pro (should be scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Entity 1 should now have Premium (active) + Pro (scheduled)
	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: entity1,
		productId: pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	// Attach Premium to entity 3
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[2].id,
	});

	// Entity 3 should have Premium active
	const entity3 = await autumnV1.entities.get(customerId, entities[2].id);
	expectProductAttached({
		customer: entity3,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Verify subscription correctness
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
