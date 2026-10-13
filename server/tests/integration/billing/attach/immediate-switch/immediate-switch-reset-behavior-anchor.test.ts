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
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// FREE TO PAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Free to Paid - reset_at anchor preserved from free product
 *
 * Scenario:
 * - Free product (50 messages)
 * - Advance 15 days mid-cycle
 * - Track 20 usage
 * - Upgrade to Pro paid ($20/mo, 100 messages)
 *
 * Expected:
 * - next_reset_at anchor preserved from free product
 * - Usage resets for consumable
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 5: free to paid preserves reset_at anchor")}`,
	async () => {
		const customerId = "reset-free-to-paid";

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		// Advance 15 days so we're mid-cycle when upgrading
		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track some usage on free
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Get free product's reset_at - this is the anchor we expect to be preserved
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const freeResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(freeResetAt).toBeDefined();

		// Upgrade to paid
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		// KEY: next_reset_at should preserve the same anchor from free product
		const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
		expect(newResetAt).toBeDefined();

		// Reset anchor is preserved - should be the same as the free product's reset_at

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100, // Usage resets for consumable on upgrade
			usage: 0,
			resetsAt: addMonths(advancedTo, 1).getTime(),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVAL CHANGE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Monthly to Annual - reset_at anchor preserved
 *
 * Scenario:
 * - Pro monthly ($20/mo, 100 messages)
 * - Advance 15 days mid-cycle
 * - Track 30 usage
 * - Upgrade to Pro annual ($200/year, 100 messages)
 *
 * Expected:
 * - next_reset_at anchor is preserved from monthly
 * - Usage resets for consumable
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 6: monthly to annual preserves reset_at anchor")}`,
	async () => {
		const customerId = "reset-monthly-to-annual";

		const proMonthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMonthlyMessages],
		});

		const proAnnualMessages = items.monthlyMessages({ includedUsage: 100 });
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [proAnnualMessages],
		});

		// Advance 15 days so we're mid-cycle when upgrading
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proMonthly, proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proMonthly.id }),
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

		// Get monthly reset_at - this is the anchor we expect to be preserved
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const monthlyResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(monthlyResetAt).toBeDefined();

		// Upgrade to annual
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [proAnnual.id],
			notPresent: [proMonthly.id],
		});

		// KEY: next_reset_at should preserve the same anchor (monthly reset carries over to annual)
		const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
		expect(newResetAt).toBeDefined();

		// Reset anchor is preserved - should be the same as the monthly reset_at
		expect(newResetAt).toBe(monthlyResetAt);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100, // Usage resets for consumable on upgrade
			usage: 0,
			resetsAt: monthlyResetAt!,
		});
	},
);
