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
// PREPAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prepaid - usage RESETS on upgrade, reset_at preserved
 *
 * Scenario:
 * - Pro with prepaid (200 purchased)
 * - Advance 15 days mid-cycle
 * - Track 50 usage (balance = 150)
 * - Upgrade to premium with prepaid (300 purchased)
 *
 * Expected:
 * - Usage RESETS to 0 on upgrade (prepaid behavior)
 * - Balance = 300 (new purchased quantity)
 * - next_reset_at stays same
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 2: prepaid usage resets, reset_at preserved")}`,
	async () => {
		const customerId = "reset-prepaid-usage-resets";

		const proPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPrepaid],
		});

		const premiumPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPrepaid],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.advanceTestClock({ days: 15 }),
			],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 4000));

		// Track 50 usage
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Get original reset_at before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(originalResetAt).toBeDefined();

		// Verify state before upgrade: balance = 150
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 50,
		});

		// Attach premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// KEY: Usage RESETS on prepaid upgrade, reset_at preserved
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 300,
			usage: 0,
			resetsAt: originalResetAt!,
		});
	},
);

/**
 * Prepaid vs Allocated comparison - different behaviors
 *
 * Scenario:
 * - Pro with BOTH prepaid messages and allocated users
 * - Advance 15 days mid-cycle
 * - Track 50 messages and 3 users
 * - Upgrade to premium with both
 *
 * Expected:
 * - Messages (prepaid): usage RESETS
 * - Users (allocated): usage CARRIES OVER
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 3: prepaid resets, allocated carries over")}`,
	async () => {
		const customerId = "reset-prepaid-vs-allocated";

		const proPrepaidMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const proAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });
		const pro = products.pro({
			id: "pro",
			items: [proPrepaidMessages, proAllocatedUsers],
		});

		const premiumPrepaidMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 10 });
		const premium = products.premium({
			id: "premium",
			items: [premiumPrepaidMessages, premiumAllocatedUsers],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Wait for webhooks to process and cache to reset
		await new Promise((r) => setTimeout(r, 2000));

		// Track both features
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await new Promise((r) => setTimeout(r, 2000));

		// Verify state before upgrade
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 150, // 200 - 50
			usage: 50,
		});
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Users,
			includedUsage: 5,
			balance: 2, // 5 - 3
			usage: 3,
		});

		// Attach premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// KEY DIFFERENCE:
		// Messages (prepaid): RESETS - balance = 200, usage = 0
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});

		// Users (allocated): CARRIES OVER - balance = 10 - 3 = 7, usage = 3
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 7,
			usage: 3,
		});
	},
);
