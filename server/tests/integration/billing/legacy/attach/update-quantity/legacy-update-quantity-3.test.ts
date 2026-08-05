/**
 * Attach Update Quantity Tests (Legacy Migration) - Slice 3 of 3
 *
 * Tests for attach endpoint quantity updates including cycle renewal.
 * These tests focus on quantity decreases with OnDecrease.None and prepaid users.
 *
 * Migrated from:
 * - server/tests/attach/prepaid/prepaid2.test.ts (quantity upgrade, prorate immediately, mid-cycle)
 * - server/tests/attach/prepaid/prepaid5.test.ts (prepaid add-on with entities)
 *
 * Key behaviors tested:
 * - Deferred quantity decreases applied at the next cycle
 * - Prepaid usage preserved across quantity upgrades
 */

import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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

		// After next cycle: balance should reset to new quantity (includedUsage + downgradedQuantityV1).
		// Poll: the pending decrease is applied by `invoice.created`'s prepaid task
		// (options.upcoming_quantity -> quantity, then reset), and a read taken
		// before that webhook lands sees the OLD quantity's reset (400).
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid users (billingUnits: 1) - upgrade quantity mid-cycle, usage preserved
// (Migrated from updateQuantity/updateQuantity1.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid users with quantity 2 (billingUnits: 1, $12/user)
 * - Error when re-attaching with same options
 * - Track 2 users usage
 * - Advance test clock 1 week (mid-cycle)
 * - Upgrade quantity to 4
 *
 * Expected Result:
 * - Re-attach with same options throws ProductAlreadyAttached
 * - After upgrade: balance = 4 - 2 = 2, usage stays at 2
 */
test.concurrent(
	`${chalk.yellowBright("attach: prepaid users upgrade quantity mid-cycle, usage preserved")}`,
	async () => {
		const customerId = "attach-prepaid-users-qty-upgrade";
		const usage = 2;

		const prepaidItem = items.prepaidUsers({
			billingUnits: 1,
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Users, quantity: 2 }],
				}),
			],
		});

		// Re-attaching with same options should throw
		await expectAutumnError({
			func: async () => {
				await autumnV1.attach({
					customer_id: customerId,
					product_id: pro.id,
					options: [{ feature_id: TestFeature.Users, quantity: 2 }],
				});
			},
		});

		// Track 2 users, advance 1 week, upgrade to quantity 4
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usage,
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Users, quantity: 4 }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same after quantity upgrade
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Users,
			includedUsage: 4,
			balance: 4 - usage,
			usage,
		});
	},
);
