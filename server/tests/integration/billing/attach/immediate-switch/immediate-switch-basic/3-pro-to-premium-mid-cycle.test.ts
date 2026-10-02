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
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro to Premium mid-cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Advance 15 days
 * - Upgrade to premium ($50/mo)
 *
 * Expected Result:
 * - Prorated charge for remaining half of cycle
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 3: pro to premium mid-cycle")}`,
	async () => {
		const customerId = "imm-switch-pro-premium-midcycle";

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

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Calculate expected prorated amount using actual billing period from Stripe
		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 20, // Pro base price
			newAmount: 50, // Premium base price
		});

		// 1. Preview upgrade mid-cycle - prorated charge
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

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

		// Verify invoices: pro ($20) + prorated upgrade
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});
	},
);
