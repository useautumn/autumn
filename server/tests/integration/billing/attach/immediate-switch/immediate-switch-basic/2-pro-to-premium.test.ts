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
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro to Premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo)
 *
 * Expected Result:
 * - Premium is active, pro is removed
 * - Prorated charge for price difference
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 2: pro to premium")}`,
	async () => {
		const customerId = "imm-switch-pro-to-premium";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// 1. Preview upgrade - verify prorated charge
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		// At start of cycle, full price difference: $50 - $20 = $30
		expect(preview.total).toBe(30);

		// 2. Attach premium (upgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify product states
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// Verify messages feature has premium's balance
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await timeout(2000);

		// Verify invoices: pro ($20) + upgrade ($30)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 30,
			latestInvoiceProductId: premium.id,
		});
	},
);
