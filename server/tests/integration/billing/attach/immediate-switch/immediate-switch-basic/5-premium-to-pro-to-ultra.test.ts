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
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium to Pro (scheduled) to Ultra (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro (scheduled for end of cycle)
 * - Upgrade to ultra ($200/mo) - should cancel scheduled downgrade
 *
 * Expected Result:
 * - Scheduled downgrade is cancelled
 * - Ultra is active immediately
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 5: premium to pro to ultra")}`,
	async () => {
		const customerId = "imm-switch-premium-pro-ultra";

		const messagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const ultraMessagesItem = items.monthlyMessages({ includedUsage: 5000 });
		const ultra = products.ultra({
			id: "ultra",
			items: [ultraMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, ultra] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: pro.id }), // Downgrade - scheduled
			],
		});

		// Verify scheduled state before upgrade
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

		// 1. Preview upgrade to ultra
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: ultra.id,
		});
		// Upgrade from premium ($50) to ultra ($200) = $150 difference
		expect(preview.total).toBe(150);

		// 2. Attach ultra (upgrade - should cancel scheduled downgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: ultra.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify product states - ultra active, premium and pro removed
		await expectCustomerProducts({
			customer,
			active: [ultra.id],
			notPresent: [premium.id, pro.id],
		});

		// Verify messages has ultra's balance
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 5000,
			balance: 5000,
			usage: 0,
		});
	},
);
