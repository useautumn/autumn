/**
 * Legacy Attach V1 Downgrade Tests (Customer-Level) - Slice 1 of 3
 *
 * Migrated from:
 * - server/tests/attach/downgrade/downgrade1.test.ts (premium -> pro, advance clock)
 * - server/tests/attach/downgrade/downgrade2.test.ts (premium -> free, advance clock)
 *
 * Tests V1 attach downgrade behavior for customer-level subscriptions:
 * - Scheduled downgrades (current product canceling, new product scheduled)
 * - Clock advancement to activate scheduled downgrades
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Premium -> Pro, advance clock
// (from downgrade1)
//
// Scenario:
// - Premium ($50/month) with consumable Words
// - Pro ($20/month) with consumable Words
// - Attach Premium, then downgrade to Pro (scheduled)
// - Advance clock to next cycle
//
// Expected:
// - Premium is canceling (scheduled for end of cycle)
// - Pro is scheduled
// - After clock advance: Pro is active, Premium is gone
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 1: premium -> pro, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-1";

		const wordsItem = items.consumableWords();
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		// Downgrade to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		// Verify: Premium canceling, Pro scheduled
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});

		await expectProductScheduled({
			customer: customerBefore,
			productId: pro.id,
		});

		// Advance clock to next cycle
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});

		// Verify: Pro is active, Premium is gone
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfter,
			productId: pro.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: premium.id,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium -> Free, advance clock
// (from downgrade2)
//
// Scenario:
// - Premium ($50/month) with consumable Words
// - Free (no price) with Words (100 included)
// - Attach Premium, then downgrade to Free (scheduled)
// - Advance clock to next cycle
//
// Expected:
// - Premium is canceling
// - Free is scheduled
// - After clock advance: Free is active with 100 Words balance
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 2: premium -> free, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-2";

		const wordsConsumable = items.consumableWords();
		const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const free = products.base({ id: "free", items: [wordsIncluded] });

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [premium, free] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		// Downgrade to Free
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		// Verify: Premium canceling, Free scheduled
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer: customerBefore,
			productId: premium.id,
		});

		await expectProductScheduled({
			customer: customerBefore,
			productId: free.id,
		});

		// Advance clock to next cycle
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});

		// Verify: Free is active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfter,
			productId: free.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: premium.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Words,
			balance: 100,
		});
	},
);
