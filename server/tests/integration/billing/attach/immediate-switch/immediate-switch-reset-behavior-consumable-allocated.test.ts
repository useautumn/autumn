// Immediate switch reset behavior (attach V2): consumable/prepaid usage resets, allocated
// usage carries over, and the reset_at anchor is preserved across upgrades.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Consumable - same interval upgrade preserves reset_at, usage resets
 *
 * Scenario:
 * - Pro monthly (100 messages)
 * - Advance 15 days mid-cycle
 * - Track 30 usage
 * - Upgrade to Premium monthly (500 messages)
 *
 * Expected:
 * - next_reset_at stays the same (same billing interval)
 * - Usage RESETS for consumable (new allowance starts fresh)
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 1: consumable same interval preserves reset_at")}`,
	async () => {
		const customerId = "reset-consumable-same-interval";

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		// Advance 15 days so we're mid-cycle when upgrading - this makes reset_at comparison meaningful
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track some usage
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Get original reset_at before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(originalResetAt).toBeDefined();

		// Verify pre-upgrade state
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 70,
			usage: 30,
		});

		// Upgrade to premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// KEY: next_reset_at stays the same, but usage RESETS for consumable
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500, // Usage resets for consumable on upgrade
			usage: 0,
			resetsAt: originalResetAt!,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// ALLOCATED TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Allocated - reset_at preserved, usage carries over
 *
 * Scenario:
 * - Pro with allocated (5 users included)
 * - Advance 15 days mid-cycle
 * - Track 3 users
 * - Upgrade to Premium (10 users included)
 *
 * Expected:
 * - next_reset_at stays the same
 * - Usage carries over (allocated behavior)
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 4: allocated preserves reset_at, usage carries over")}`,
	async () => {
		const customerId = "reset-allocated-carries-over";

		const proAllocated = items.allocatedUsers({ includedUsage: 5 });
		const pro = products.pro({
			id: "pro",
			items: [proAllocated],
		});

		const premiumAllocated = items.allocatedUsers({ includedUsage: 10 });
		const premium = products.premium({
			id: "premium",
			items: [premiumAllocated],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track 3 users
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Get original reset_at before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Users]?.next_reset_at;
		expect(originalResetAt).toBeDefined();

		// Verify pre-upgrade state
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Users,
			includedUsage: 5,
			balance: 2, // 5 - 3
			usage: 3,
		});

		// Upgrade to premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// KEY: next_reset_at stays same, usage carries over
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 7, // 10 - 3 (usage carries over for allocated)
			usage: 3,
			resetsAt: originalResetAt!,
		});
	},
);
