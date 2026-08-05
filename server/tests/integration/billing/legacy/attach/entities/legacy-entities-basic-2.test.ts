/**
 * Legacy Attach V1 Entity Tests (slice 2 of 2)
 *
 * Migrated from:
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
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForEntityUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { expectScheduledApiSub } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

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

test.concurrent(
	`${chalk.yellowBright("legacy-entities 4: attach to multiple entities, track usage separately")}`,
	async () => {
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

		// Both attaches' webhooks first, then track (see quiesceCustomerWebhooks).
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

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

		// Verify non-cached results: the deduction reaches Postgres asynchronously,
		// so wait for it rather than sleeping 2s and hoping.
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entity1Id,
			featureId: TestFeature.Words,
			usage: entity1Usage,
		});

		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId: entity2Id,
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
	},
);

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

test.concurrent(
	`${chalk.yellowBright("legacy-entities 5: downgrade entity product")}`,
	async () => {
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
	},
);
