/**
 * Legacy Attach V1 Downgrade Tests (Customer-Level) - Slice 2 of 3
 *
 * Migrated from:
 * - server/tests/attach/downgrade/downgrade3.test.ts (chain: premium -> pro -> free -> pro -> premium)
 * - server/tests/attach/downgrade/downgrade5.test.ts (premium -> pro schedule, renew, advance clock)
 *
 * Tests V1 attach downgrade behavior for customer-level subscriptions:
 * - Scheduled downgrades (current product canceling, new product scheduled)
 * - Clock advancement to activate scheduled downgrades
 * - Renewing to cancel scheduled downgrades
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
// TEST 3: Chain: Premium -> Pro -> Free -> Pro -> Premium
// (from downgrade3)
//
// Scenario:
// - Premium ($50/month), Pro ($20/month), Free (no price)
// - Attach Premium
// - Downgrade to Pro (scheduled)
// - Change downgrade to Free (scheduled)
// - Change downgrade to Pro (scheduled)
// - Renew Premium (cancels schedule)
//
// Expected:
// - Each downgrade replaces the previous schedule
// - Renewing cancels all scheduled downgrades
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 3: chain premium -> pro -> free -> pro -> premium")}`,
	async () => {
		const customerId = "legacy-downgrade-3";

		const wordsConsumable = items.consumableWords();
		const wordsIncluded = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const pro = products.pro({ id: "pro", items: [wordsConsumable] });
		const free = products.base({ id: "free", items: [wordsIncluded] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [premium, pro, free] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		// Step 1: Downgrade to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		// Step 2: Change downgrade to Free
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: free.id });
		await expectProductNotPresent({ customer, productId: pro.id });

		// Step 3: Change downgrade to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });
		await expectProductNotPresent({ customer, productId: free.id });

		// Step 4: Renew Premium (cancels scheduled downgrade)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectProductNotPresent({ customer, productId: pro.id });
		await expectProductNotPresent({ customer, productId: free.id });
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium -> Pro schedule, renew removes schedule, advance clock
// (from downgrade5)
//
// Scenario:
// - Premium ($50/month) with Messages (100 included)
// - Pro ($20/month) with Dashboard, Messages (10), Admin (unlimited)
// - Attach Premium
// - Downgrade to Pro (scheduled)
// - Renew Premium (removes scheduled Pro)
// - Downgrade to Pro again
// - Advance clock
//
// Expected:
// - Renewing cancels the scheduled downgrade
// - After final downgrade and clock advance: Pro is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 5: premium -> pro schedule, renew, advance clock")}`,
	async () => {
		const customerId = "legacy-downgrade-5";

		const dashboardItem = items.dashboard();
		const messagesItemPro = items.monthlyMessages({ includedUsage: 10 });
		const adminItem = items.adminRights();
		const messagesItemPremium = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItemPro, adminItem],
		});
		const premium = products.premium({
			id: "premium",
			items: [messagesItemPremium],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		// Step 1: Downgrade to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		// Verify Premium is still the active product with correct features
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
		});

		// Step 2: Renew Premium (cancels scheduled Pro)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectProductNotPresent({ customer, productId: pro.id });

		// Step 3: Downgrade to Pro again
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: premium.id });
		await expectProductScheduled({ customer, productId: pro.id });

		// Step 4: Advance clock to next cycle
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});

		// Verify: Pro is active with correct features
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

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			balance: 10,
		});
	},
);
