/** Immediate Switch Edge Case Tests (Attach V2): upgrades across all feature types -
 * consumable resets, allocated carry-over, prepaid recalculation, proration. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade product with ALL feature types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with:
 *   - Boolean: Dashboard access
 *   - Consumable: Messages (100 included)
 *   - Allocated: Users (3 included)
 * - Track usage:
 *   - Messages: 50
 *   - Users: 2
 * - Upgrade to Premium with:
 *   - Boolean: Dashboard + AdminRights
 *   - Consumable: Messages (500 included)
 *   - Allocated: Users (10 included)
 *
 * Expected Result:
 * - Boolean features: Both available
 * - Consumable messages: Usage RESETS to 0, balance = 500
 * - Allocated users: Usage CARRIES OVER (2), balance = 10 - 2 = 8
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-edge-cases 1: all feature types - boolean, consumable, allocated")}`,
	async () => {
		const customerId = "imm-switch-all-types";

		// Pro with boolean, consumable, and allocated
		const pro = products.pro({
			id: "pro",
			items: [
				items.dashboard(),
				items.consumableMessages({ includedUsage: 100 }),
				items.allocatedUsers({ includedUsage: 3 }),
			],
		});

		// Premium with more of everything
		const premium = products.premium({
			id: "premium",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.consumableMessages({ includedUsage: 500 }),
				items.allocatedUsers({ includedUsage: 10 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track consumable messages (50)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		// Track allocated users (2)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		// Wait for track to sync
		await new Promise((r) => setTimeout(r, 2000));

		// Verify state before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 50,
			usage: 50,
		});

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Users,
			includedUsage: 3,
			balance: 1,
			usage: 2,
		});

		// 1. Preview upgrade
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		// Price difference: $50 - $20 = $30
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

		// Verify consumable messages - usage RESETS
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Verify allocated users - usage CARRIES OVER
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 8, // 10 - 2 = 8
			usage: 2,
		});

		// Verify invoices: pro ($20) + upgrade ($30)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 30,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade mid-cycle with all feature types - verify proration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable + allocated
 * - Advance 15 days
 * - Track usage
 * - Upgrade to Premium
 *
 * Expected Result:
 * - Prorated charge for price difference
 * - Consumable resets, allocated carries over
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-edge-cases 2: all types mid-cycle with proration")}`,
	async () => {
		const customerId = "imm-switch-all-types-midcycle";

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

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track usage mid-cycle
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Calculate expected prorated amount using actual billing period from Stripe
		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 20, // Pro base price
			newAmount: 50, // Premium base price
		});

		// 1. Preview upgrade
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		// 2. Attach premium
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

		// Verify consumable - RESETS
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Verify allocated - CARRIES OVER
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 8,
			usage: 2,
		});

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});
	},
);
