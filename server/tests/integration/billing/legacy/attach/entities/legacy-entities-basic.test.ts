/**
 * Legacy Attach V1 Entity Tests (slice 1 of 2)
 *
 * Migrated from:
 * - server/tests/attach/entities/entity1.test.ts (attach to entity via checkout)
 * - server/tests/attach/entities/entity2.test.ts (attach pro annual, track usage, invoice after cycle)
 * - server/tests/attach/entities/entity3.test.ts (attach pro annual, cancel with usage invoice)
 *
 * Tests V1 attach behavior for entity-level subscriptions:
 * - Attaching products to entities
 * - Tracking usage per entity
 * - Entity-level invoices
 * - Entity-level downgrades
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { pollAssertion } from "@tests/integration/billing/utils/pollEntityState";
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForEntityUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { expectInvoiceAfterUsage } from "@tests/utils/expectUtils/expectSingleUse/expectUsageInvoice";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

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

test.concurrent(
	`${chalk.yellowBright("legacy-entities 1: attach to entity via checkout")}`,
	async () => {
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
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityId,
		);

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
	},
);

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

test.concurrent(
	`${chalk.yellowBright("legacy-entities 2: attach pro annual, track usage, invoice after cycle")}`,
	async () => {
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

		// Let the attach's Stripe webhooks land BEFORE tracking — one arriving
		// inside the track→sync window drops the deduction entirely, and the cycle
		// invoice then bills $0 of usage.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track large usage
		const usage = 1250130;
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		// Verify entity has correct usage (cached)
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entityId,
		);

		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Words,
			usage,
		});

		// The cycle invoice bills the arrear usage off the Postgres row, so gate on
		// the deduction actually being there before crossing the boundary.
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Words,
			usage,
		});

		// Advance clock to next invoice (uses advanceToNextInvoice with withPause)
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
			autumn: autumnV1,
			customerId,
		});

		// Verify invoice has correct usage charges (balance reset + invoice both
		// land on the invoice.created webhook)
		await pollAssertion({
			assert: () =>
				expectInvoiceAfterUsage({
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
				}),
		});
	},
);

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

test.concurrent(
	`${chalk.yellowBright("legacy-entities 3: attach pro, cancel with usage invoice")}`,
	async () => {
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

		// Attach webhooks first, then track (see quiesceCustomerWebhooks) — the
		// final usage invoice is billed from the Postgres row.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track usage before cancel
		const usage = 1032100;
		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		// The final usage invoice is billed from the Postgres row, so make sure the
		// deduction is there before the cancel — a cache invalidation landing in the
		// track→sync window otherwise bills $0.
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Words,
			usage,
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
			autumn: autumnV1,
			customerId,
		});

		// Verify invoice has correct usage charges and product is expired
		await pollAssertion({
			assert: () =>
				expectInvoiceAfterUsage({
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
				}),
		});
	},
);
