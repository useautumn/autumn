/** Immediate Switch Edge Case Tests (Attach V2): upgrades across all feature types -
 * consumable resets, allocated carry-over, prepaid recalculation, proration. */

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Multiple consecutive upgrades with mixed feature types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free with:
 *   - Consumable messages (50 included)
 *   - Allocated users (1 included)
 * - Track usage
 * - Upgrade to Pro
 * - Track more usage
 * - Upgrade to Premium
 *
 * Expected Result:
 * - Each upgrade: consumable resets, allocated carries over
 * - Final state reflects premium limits with carried-over allocated usage
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-edge-cases 5: consecutive upgrades free -> pro -> premium")}`,
	async () => {
		const customerId = "imm-switch-consecutive";

		const free = products.base({
			id: "free",
			items: [
				items.consumableMessages({ includedUsage: 50 }),
				items.monthlyUsers({ includedUsage: 1 }),
			],
		});

		const pro = products.pro({
			id: "pro",
			items: [
				items.consumableMessages({ includedUsage: 100 }),
				items.allocatedUsers({ includedUsage: 3 }),
			],
		});

		const premium = products.premium({
			id: "premium",
			items: [
				items.consumableMessages({ includedUsage: 500 }),
				items.allocatedUsers({ includedUsage: 10 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track initial usage on free
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Upgrade to Pro
		const previewToPro = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(previewToPro.total).toBe(20); // Pro base price

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Verify after first upgrade
		const customerAfterPro =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPro,
			active: [pro.id],
			notPresent: [free.id],
		});

		// Consumable reset
		expectCustomerFeatureCorrect({
			customer: customerAfterPro,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Allocated carried over
		expectCustomerFeatureCorrect({
			customer: customerAfterPro,
			featureId: TestFeature.Users,
			includedUsage: 3,
			balance: 2, // 3 - 1 = 2
			usage: 1,
		});

		// Track more usage on Pro
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2, // Adds 2 to existing 1 = 3 total
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Upgrade to Premium
		const previewToPremium = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(previewToPremium.total).toBe(30); // $50 - $20

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		// Verify final state
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [free.id, pro.id],
		});

		// Consumable reset again
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Allocated carried over (3 users: 1 from free + 2 from pro)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 7, // 10 - 3 = 7
			usage: 3,
		});

		// Verify invoices: pro ($20) + premium upgrade ($30)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 30,
		});
	},
);
