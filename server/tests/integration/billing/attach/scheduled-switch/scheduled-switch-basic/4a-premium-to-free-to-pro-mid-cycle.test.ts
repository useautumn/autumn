/**
 * Scheduled Switch Basic Tests (Attach V2)
 *
 * Tests for basic downgrade scenarios where a lower-tier product takes effect at end of billing cycle.
 *
 * Key behaviors:
 * - Downgrade schedules new product for end of cycle
 * - Current product enters "canceling" state (active with canceled_at set)
 * - New product has "scheduled" status
 * - At cycle end: current product removed, scheduled product becomes active
 * - Scheduled downgrades can be replaced by other downgrades
 *
 * Each scenario is split into an "a" (mid-cycle) and "b" (after cycle) test with
 * separate customers so each test owns its own Stripe test clock.
 *
 * NOTE: Tests for "upgrade cancels scheduled downgrade" are in immediate-switch-basic.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium to Free (scheduled) to Pro (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to free (scheduled)
 * - Upgrade to pro ($20/mo) - immediate, should cancel scheduled downgrade
 *
 * Expected Result:
 * - Scheduled free is cancelled
 * - Pro is active immediately (downgrade from premium)
 * - Premium removed
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 4a: premium to free to pro (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-free-pro-a";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade to free
			],
		});

		// Verify Stripe subscription after premium attach and free scheduled
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify state before upgrade
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

		// Upgrade to pro - this should:
		// 1. Cancel the scheduled free downgrade
		// 2. Switch from premium to pro (still a downgrade since pro < premium)
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		// Downgrade from premium ($50) to pro ($20) - scheduled, no charge
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			total: 20,
			startsAt: addMonths(advancedTo, 1).getTime(),
		}); // Pro is $20/mo next cycle

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Premium still canceling, pro scheduled (replacing free)
		await expectProductCanceling({
			customer,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer,
			productId: free.id,
		});

		// Verify Stripe subscription after replacing scheduled product
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
