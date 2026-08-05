/**
 * Legacy Attach V1 Upgrade - Merged Entity Tests (slice 1 of 2)
 *
 * Migrated from:
 * - server/tests/merged/upgrade/mergedUpgrade1.test.ts (upgrade entity in merged sub + invoice)
 * - server/tests/merged/upgrade/mergedUpgrade2.test.ts (upgrade cancels scheduled downgrade)
 *
 * Tests V1 attach (s.attach) behavior for upgrade scenarios in merged entity subscriptions.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { waitForEntityUsageInDb } from "@tests/integration/billing/utils/pollEntityState";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade entity in merged sub + usage invoice verification
// (from mergedUpgrade1)
//
// Scenario:
// - Pro and Premium products with consumable Words
// - 2 entities, attach Pro to both → merged sub
// - Track 100k words on entity 1, 300k on entity 2
// - Advance clock 2 weeks, upgrade entity 1 from Pro to Premium
// - Advance to next invoice
// - Verify invoice total = Pro base + Premium base + entity 2 usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 1: upgrade entity in merged sub + invoice")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-1";

		const wordsItem = items.consumableWords();
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const premium = products.premium({ id: "premium", items: [wordsItem] });

		const entity1Val = 100000;
		const entity2Val = 300000;

		const { autumnV1, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
				s.track({
					featureId: TestFeature.Words,
					value: entity1Val,
					entityIndex: 0,
					timeout: 3000,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: entity2Val,
					entityIndex: 1,
					timeout: 3000,
				}),
				// s.advanceTestClock({ weeks: 2 }),
			],
		});

		// Both entities' usage is billed later — entity 1's on the upgrade invoice
		// below, entity 2's on the next cycle invoice — and both of those read
		// Postgres, not the cached balance. A `/track` lands in Redis first and syncs
		// to Postgres asynchronously; a Stripe webhook from the preceding attach
		// invalidating the cached customer inside that window drops the deduction
		// outright, and the usage silently reverts. Gate on the Postgres-backed read
		// BEFORE the upgrade attach fires more webhooks, instead of racing it.
		await Promise.all([
			waitForEntityUsageInDb({
				autumn: autumnV1,
				customerId,
				entityId: entities[0].id,
				featureId: TestFeature.Words,
				balance: -entity1Val,
			}),
			waitForEntityUsageInDb({
				autumn: autumnV1,
				customerId,
				entityId: entities[1].id,
				featureId: TestFeature.Words,
				balance: -entity2Val,
			}),
		]);

		// Upgrade entity 1 from Pro to Premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Words, value: entity1Val }],
			options: { onlyArrear: true },
		});

		const entity1Base =
			getBasePrice({ product: premium }) - getBasePrice({ product: pro });

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 3,
			latestTotal: entity1Base + entity1Overage,
		});

		// Advance to next invoice to check usage billing
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		// Entity 2's usage on pro should show up on the invoice
		const expectedUsageTotal = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Words, value: entity2Val }],
			options: { includeFixed: false, onlyArrear: true },
		});

		const basePrice =
			getBasePrice({ product: pro }) + getBasePrice({ product: premium });

		// The renewal invoice reaches Autumn in two hops: `invoice.created` stores it
		// with only the recurring base prices on it ($70), and Autumn's arrear line
		// item for entity 2's usage only shows in the stored total once
		// invoice.finalized/paid re-syncs it from Stripe. Reading `invoices[0]` once,
		// straight after the advance, lands in that window and sees the bare base
		// price — so poll, and assert by content rather than by position, because
		// which invoice carries the charge is not something this test should assume.
		const expectedInvoiceTotal = basePrice + expectedUsageTotal;
		await pollUntilAsserted({
			fetch: () => autumnV1.customers.get<ApiCustomerV3>(customerId),
			assert: (customer) => {
				const totals = (customer.invoices ?? []).map(
					(invoice) => invoice.total,
				);
				const billed = totals.some(
					(total) => Math.abs(total - expectedInvoiceTotal) < 0.01,
				);
				expect(
					billed,
					`No invoice totals $${expectedInvoiceTotal} for ${customerId} — invoice totals: [${totals.join(", ")}]`,
				).toBe(true);
			},
			timeoutMs: DEFAULT_SETTLE_TIMEOUT_MS,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade cancels scheduled downgrade (single entity)
// (from mergedUpgrade2)
//
// Scenario:
// - Premium, Pro, Free, Growth products with Words feature
// - 2 entities, attach Premium to both
// - Downgrade entity 1 from Premium to Pro (scheduled)
// - Upgrade entity 1 to Growth → cancels scheduled Pro, immediate switch
//
// Expected:
// - Entity 1: Growth (active)
// - Entity 2: Premium (active)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 2: upgrade cancels scheduled downgrade")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-2";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		// Downgrade entity 1 from Premium to Pro (should be scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		// Verify entity 1 has Premium (active) + Pro (scheduled)
		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		// Upgrade entity 1 to Growth → should cancel scheduled Pro and immediate switch
		await autumnV1.attach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: growth.id,
			status: "active" as unknown as CusProductStatus,
		});

		// Entity 2 should still have Premium
		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
	},
);
