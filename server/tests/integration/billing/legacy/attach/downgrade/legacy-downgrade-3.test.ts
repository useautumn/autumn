/**
 * Legacy Attach V1 Downgrade Tests (Customer-Level) - Slice 3 of 3
 *
 * Migrated from:
 * - server/tests/attach/downgrade/downgrade4.test.ts (quarterly -> premium -> pro, mixed intervals)
 *
 * Tests V1 attach downgrade behavior for customer-level subscriptions:
 * - Scheduled downgrades (current product canceling, new product scheduled)
 * - Clock advancement to activate scheduled downgrades
 * - Mixed billing intervals (quarterly -> monthly)
 */

import { test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro-Quarter -> Premium -> Pro (mixed intervals)
// (from downgrade4)
//
// Scenario:
// - Pro-Quarter ($20/quarter) with consumable Words
// - Premium ($50/month) with consumable Words
// - Pro ($20/month) with consumable Words
// - Attach Pro-Quarter
// - Downgrade to Premium (scheduled for end of quarter)
// - Change downgrade to Pro (scheduled for end of quarter)
// - Advance clock 3 months
//
// Expected:
// - After 3 months: Pro (monthly) is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-downgrade 4: pro-quarter -> premium -> pro (mixed intervals)")}`,
	async () => {
		const customerId = "legacy-downgrade-4";

		const wordsItem = items.consumableWords();
		const quarterlyPrice = constructPriceItem({
			price: 500,
			interval: BillingInterval.Quarter,
		});

		const proQuarter = constructProduct({
			id: "pro-quarter",
			items: [wordsItem, quarterlyPrice],
			type: "free",
			isDefault: false,
			interval: BillingInterval.Quarter,
		});

		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [proQuarter, premium, pro] }),
			],
			actions: [s.attach({ productId: proQuarter.id })],
		});

		// Downgrade to Premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: proQuarter.id });
		await expectProductScheduled({ customer, productId: premium.id });

		// Change downgrade to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer, productId: proQuarter.id });
		await expectProductScheduled({ customer, productId: pro.id });

		// Advance clock 3 months (end of quarter) - advance 1.5 months twice
		const advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfWeeks: 6,
			waitForSeconds: 30,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addWeeks(advancedTo, 8).getTime(),
			waitForSeconds: 30,
		});

		// Verify: Pro (monthly) is active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfter,
			productId: pro.id,
		});

		await expectProductNotPresent({
			customer: customerAfter,
			productId: proQuarter.id,
		});
	},
);
