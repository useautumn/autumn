/**
 * Legacy Attach V1 Entity Tests
 *
 * Migrated from:
 * - server/tests/attach/entities/entity1.test.ts (attach to entity via checkout)
 * - server/tests/attach/entities/entity2.test.ts (attach pro annual, track usage, invoice after cycle)
 * - server/tests/attach/entities/entity3.test.ts (attach pro annual, cancel with usage invoice)
 * - server/tests/attach/entities/entity4.test.ts (attach to multiple entities, track usage separately)
 * - server/tests/attach/entities/entity5.test.ts (downgrade entity product, advance clock)
 *
 * Tests V1 attach behavior for entity-level subscriptions:
 * - Attaching products to entities
 * - Tracking usage per entity
 * - Entity-level invoices
 * - Entity-level downgrades
 */

import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectScheduledApiSub } from "@tests/utils/expectUtils/expectProductAttached";
import { expectInvoiceAfterUsage } from "@tests/utils/expectUtils/expectSingleUse/expectUsageInvoice";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach to entity via checkout
// (from entity1)
//
// Scenario:
// - Pro ($20/month) with Words (1500 included, arrear)
// - Create entity, attach Pro to entity
//
// Expected:
// - Entity has Pro product attached
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 1: attach to entity via checkout")}`, async () => {
	const customerId = "legacy-entities-1";

	const wordsItem = items.consumableWords({ includedUsage: 1500 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Verify entity has Pro attached
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Also verify customer has product attached to entity
	const customer = await autumnV1.customers.get(customerId);
	await expectProductActive({
		customer,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach pro annual to entity, track usage, invoice after cycle
// (from entity2)
//
// Scenario:
// - Pro Annual ($200/year) with Words (1500 included, arrear)
// - Create entity, attach Pro Annual
// - Track large usage (1,250,130 words)
// - Advance clock to next invoice
//
// Expected:
// - Entity has correct usage tracked
// - Invoice generated with overage charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 2: attach pro annual, track usage, invoice after cycle")}`, async () => {
	const customerId = "legacy-entities-2";

	const wordsItem = items.consumableWords({ includedUsage: 1500 });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proAnnual] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proAnnual.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Track large usage
	const usage = 1250130;
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Words,
		value: usage,
	});

	// Verify entity has correct usage (cached)
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Words,
		usage,
	});

	// Also verify non-cached
	await timeout(2000);
	const nonCachedEntity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entityId,
		{ skip_cache: "true" },
	);

	expectCustomerFeatureCorrect({
		customer: nonCachedEntity,
		featureId: TestFeature.Words,
		usage,
	});

	// Advance clock to next invoice (uses advanceToNextInvoice with withPause)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify invoice has correct usage charges
	await expectInvoiceAfterUsage({
		autumn: autumnV1,
		customerId,
		entityId,
		featureId: TestFeature.Words,
		product: proAnnual,
		usage,
		stripeCli: ctx.stripeCli,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		numInvoices: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach pro annual to entity and cancel
// (from entity3)
//
// Scenario:
// - Pro ($20/month) with Words (1500 included, arrear)
// - Create entity, attach Pro
// - Track usage (1,032,100 words)
// - Cancel subscription
// - Advance clock
//
// Expected:
// - Final invoice generated with usage
// - Entity product is expired after clock advance
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 3: attach pro, cancel with usage invoice")}`, async () => {
	const customerId = "legacy-entities-3";

	const wordsItem = items.consumableWords({ includedUsage: 1500 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Track usage before cancel
	const usage = 1032100;
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Words,
		value: usage,
	});

	// Cancel subscription
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	await timeout(5000);

	// Advance clock to finalize invoice (advance past month + finalize hours)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify invoice has correct usage charges and product is expired
	await expectInvoiceAfterUsage({
		autumn: autumnV1,
		customerId,
		entityId,
		featureId: TestFeature.Words,
		product: pro,
		usage,
		stripeCli: ctx.stripeCli,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		numInvoices: 2,
		expectExpired: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Attach pro to multiple entities, track usage separately
// (from entity4)
//
// Scenario:
// - Pro ($20/month) with Words (1500 included, arrear)
// - Create 2 entities
// - Attach Pro to entity 1, then Pro to entity 2
// - Track different usage on each entity
//
// Expected:
// - Each entity has separate usage tracking
// - Usage on one entity doesn't affect the other
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 4: attach to multiple entities, track usage separately")}`, async () => {
	const customerId = "legacy-entities-4";

	const wordsItem = items.consumableWords({ includedUsage: 1500 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Track usage on entity 1
	const entity1Usage = Math.floor(Math.random() * 1000000);
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Words,
		value: entity1Usage,
	});

	// Verify entity 1 has usage, entity 2 has none (cached)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Words,
		usage: entity1Usage,
	});

	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Words,
		usage: 0,
	});

	// Verify non-cached results
	await timeout(2000);
	const entity1Uncached = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
		{ skip_cache: "true" },
	);
	const entity2Uncached = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
		{ skip_cache: "true" },
	);

	expectCustomerFeatureCorrect({
		customer: entity1Uncached,
		featureId: TestFeature.Words,
		usage: entity1Usage,
	});

	expectCustomerFeatureCorrect({
		customer: entity2Uncached,
		featureId: TestFeature.Words,
		usage: 0,
	});

	// Track usage on entity 2
	const entity2Usage = Math.floor(Math.random() * 1000000);
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity2Id,
		feature_id: TestFeature.Words,
		value: entity2Usage,
	});

	// Verify both entities have correct independent usage
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);

	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Words,
		usage: entity1Usage,
	});

	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Words,
		usage: entity2Usage,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade entity product
// (from entity5)
//
// Scenario:
// - Premium ($50/month) and Pro ($20/month) with Words (1500 included, arrear)
// - Create 2 entities
// - Attach Premium to both entities
// - Downgrade entity 1 to Pro (scheduled)
// - Advance clock
//
// Expected:
// - Entity 1 has Pro scheduled, then active after clock advance
// - Entity 2 still has Premium active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-entities 5: downgrade entity product")}`, async () => {
	const customerId = "legacy-entities-5";

	const wordsItem = items.consumableWords({ includedUsage: 1500 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });

	const { autumnV1, entities, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Downgrade entity 1 to Pro
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
	});

	// Verify Pro is scheduled on entity 1
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductScheduled({
		customer: entity1Before,
		productId: pro.id,
	});

	// Also verify scheduled subscription via API
	await expectScheduledApiSub({
		customerId,
		entityId: entity1Id,
		productId: pro.id,
	});

	// Advance clock to activate scheduled product
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
		waitForSeconds: 30,
	});

	// Verify entity 1 has Pro active
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: pro.id,
	});
	expect(entity1After.products?.length).toBe(1);

	// Verify entity 2 still has Premium active
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premium.id,
	});
	expect(entity2After.products?.length).toBe(1);
});
