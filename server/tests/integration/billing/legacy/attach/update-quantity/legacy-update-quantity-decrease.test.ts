/**
 * Attach Update Quantity Tests (Legacy Migration): mid-cycle attach quantity changes and entity-level
 * prepaid add-ons (migrated from server/tests/attach/prepaid/prepaid2.test.ts and prepaid5.test.ts).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Quantity decrease → increase → decrease flow
// (Migrated from prepaid1.test.ts - attach portion)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300
 * - Decrease to 200 (on_decrease: none, sets upcoming_quantity)
 * - Increase to 400 (on_increase: prorate_immediately, creates invoice)
 * - Decrease back to 200 (sets upcoming_quantity again)
 *
 * Expected Result:
 * - After decrease to 200: balance stays 300, upcoming_quantity = 2
 * - After increase to 400: balance becomes 400, 2 invoices (initial + proration)
 * - After decrease to 200: balance stays 400, upcoming_quantity = 2
 */
test.concurrent(
	`${chalk.yellowBright("attach: quantity decrease → increase → decrease flow")}`,
	async () => {
		const customerId = "attach-qty-dec-inc-dec";

		const prepaidItem = items.prepaidMessages({
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				// Attach with quantity 300
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		// Verify initial attach
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(
			300,
		);

		// Decrease to 200 (on_decrease: none - sets upcoming_quantity, no immediate change)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customerAfterDecrease =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		// Balance should still be 300 (no immediate change for decrease)
		expect(customerAfterDecrease.features[TestFeature.Messages].balance).toBe(
			300,
		);
		// upcoming_quantity should be set
		await expectProductItemCorrect({
			customer: customerAfterDecrease,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 300, // Still 300 / 100
			upcomingQuantity: 200, // 200 / 100
		});

		// Increase to 400 (prorate_immediately - creates invoice, immediate change)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
		});

		// Wait for invoice to be created
		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterIncrease =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		// Balance should now be 400 (immediate increase)
		expect(customerAfterIncrease.features[TestFeature.Messages].balance).toBe(
			400,
		);
		// Should have 2 invoices: initial + proration
		expectCustomerInvoiceCorrect({
			customer: customerAfterIncrease,
			count: 2,
		});

		// Decrease back to 200 (sets upcoming_quantity again)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		// Balance should still be 400 (no immediate change for decrease)
		expect(customerFinal.features[TestFeature.Messages].balance).toBe(400);
		// upcoming_quantity should be set to 2
		await expectProductItemCorrect({
			customer: customerFinal,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 400, // Still 400 / 100
			upcomingQuantity: 200, // 200 / 100
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Quantity decrease with OnDecrease.None, track usage, advance to next cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with includedUsage: 100, quantity: 300 (V1 excludes allowance)
 *   → Total balance = 100 + 300 = 400
 * - Track some usage (50)
 * - Downgrade quantity to 200 (on_decrease: None)
 *
 * Expected Result:
 * - Balance stays at 400 - 50 = 350 (NOT reduced immediately due to OnDecrease.None)
 * - upcoming_quantity is set to 200 + includedUsage = 300
 * - After next cycle: balance resets to includedUsage + new quantity = 100 + 200 = 300
 * - Subscription is correct
 *
 * KEY V1 BEHAVIOR: V1 attach quantity does NOT include includedUsage
 */
test.concurrent(
	`${chalk.yellowBright("attach: quantity decrease with OnDecrease.None + track + next cycle reset")}`,
	async () => {
		const customerId = "attach-qty-dec-none-next-cycle";
		const billingUnits = 100;
		const pricePerPack = 10;
		const includedUsage = 100;
		const usage = 50;

		const prepaidItem = items.prepaidMessages({
			includedUsage,
			billingUnits,
			price: pricePerPack,
			config: {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.None, // Key: no proration on decrease
			},
		});

		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [prepaidItem, priceItem],
		});

		// V1 attach: quantity = 300 (EXCLUDING includedUsage)
		// Total balance = includedUsage (100) + quantity (300) = 400
		const initialQuantityV1 = 300;
		const initialTotalBalance = includedUsage + initialQuantityV1; // 400
		const initialPacks = initialQuantityV1 / billingUnits; // 3

		const { autumnV1, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				// V1 attach with quantity 300 (excludes includedUsage)
				s.attach({
					productId: pro.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initialQuantityV1 },
					],
				}),
			],
		});

		// Verify initial state
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance, // 400
			balance: initialTotalBalance, // 400
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1,
			latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack, // 20 + 30 = 50
		});

		// Track some usage
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});

		// Wait for track to sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Verify balance after tracking
		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance, // 400
			balance: initialTotalBalance - usage, // 350
			usage: usage, // 50
		});

		// V1 attach: downgrade quantity to 200 (excludes includedUsage)
		const downgradedQuantityV1 = 200;
		const downgradedTotalBalance = includedUsage + downgradedQuantityV1; // 300
		const downgradedPacks = downgradedQuantityV1 / billingUnits; // 2

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: downgradedQuantityV1 },
			],
		});

		// KEY ASSERTION: With OnDecrease.None, balance should NOT change immediately
		const customerAfterDowngrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterDowngrade,
			featureId: TestFeature.Messages,
			includedUsage: initialTotalBalance, // Still 400 (unchanged until renewal)
			balance: initialTotalBalance - usage, // Still 350 (NOT 250)
			usage: usage, // 50
		});

		// No new invoice should be created (OnDecrease.None = no proration)
		await expectCustomerInvoiceCorrect({
			customer: customerAfterDowngrade,
			count: 1, // Still just the initial invoice
		});

		// upcoming_quantity should be set
		await expectProductItemCorrect({
			customer: customerAfterDowngrade,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: initialPacks * billingUnits, // 400 (current)
			upcomingQuantity: downgradedPacks * billingUnits, // 300 (next cycle)
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// After next cycle: balance should reset to new quantity (includedUsage + downgradedQuantityV1)
		const customerAfterCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: downgradedTotalBalance, // 300
			balance: downgradedTotalBalance, // 300 (reset, usage cleared)
			usage: 0,
		});

		// Should have 2 invoices: initial attach + renewal
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0), // 20 + 20 = 40
		});

		// Verify subscription is correct after cycle
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
