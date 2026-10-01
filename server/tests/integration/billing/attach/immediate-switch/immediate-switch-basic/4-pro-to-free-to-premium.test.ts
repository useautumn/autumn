/**
 * Immediate Switch Basic Tests (Attach V2)
 *
 * Tests for basic upgrade scenarios where a higher-tier product takes effect immediately.
 *
 * Key behaviors:
 * - Upgrade replaces existing product immediately
 * - Prorated charge for price difference
 * - Scheduled downgrades are cancelled when upgrading
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro to Free (scheduled) to Premium (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro
 * - Downgrade to free (scheduled for end of cycle)
 * - Upgrade to premium (should cancel scheduled downgrade)
 *
 * Expected Result:
 * - Scheduled downgrade is cancelled
 * - Premium is active immediately
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 4: pro to free to premium")}`,
	async () => {
		const customerId = "imm-switch-pro-free-premium";

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

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: free.id }), // Downgrade - scheduled
			],
		});

		// Verify scheduled state before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerBefore,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerBefore,
			productId: free.id,
		});

		// 1. Preview upgrade to premium
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		// Upgrade from pro ($20) to premium ($50) = $30 difference
		expect(preview.total).toBe(30);

		// 2. Attach premium (upgrade - should cancel scheduled downgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify product states - premium active, pro and free removed
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id, free.id],
		});

		// Verify messages has premium's balance
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
