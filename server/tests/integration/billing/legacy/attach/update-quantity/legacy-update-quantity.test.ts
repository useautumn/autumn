/**
 * Attach Update Quantity Tests (Legacy Migration) - Slice 1 of 3
 *
 * Tests for attach endpoint quantity updates that don't involve cycle renewal.
 * These tests focus on mid-cycle quantity changes and entity-level prepaid add-ons.
 *
 * Migrated from:
 * - server/tests/attach/prepaid/prepaid2.test.ts (quantity upgrade, prorate immediately, mid-cycle)
 * - server/tests/attach/prepaid/prepaid5.test.ts (prepaid add-on with entities)
 *
 * Key behaviors tested:
 * - Immediate proration when upgrading quantity mid-cycle
 * - Entity-level prepaid add-on quantity management
 * - Separate subscriptions for different entities
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { calculateProratedCharge } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { waitForCustomerUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Quantity upgrade mid-cycle with prorate immediately
// (Migrated from prepaid2.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300
 * - Track some usage
 * - Advance test clock 2 weeks (mid-cycle)
 * - Upgrade quantity to 400 (prorate_immediately)
 *
 * Expected Result:
 * - Immediate proration invoice for the upgrade
 * - Balance increases by 100 (the additional quantity)
 */
test.concurrent(
	`${chalk.yellowBright("attach: quantity upgrade mid-cycle with prorate immediately")}`,
	async () => {
		const customerId = "attach-qty-upgrade-mid-cycle";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
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

		const usage = Math.floor(Math.random() * 220); // Random usage between 0-219

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.track({ featureId: TestFeature.Messages, value: usage }),
				// Advance 2 weeks (mid-cycle)
				s.advanceTestClock({ weeks: 2 }),
			],
		});

		// The upgrade attach below invalidates the cached balance without flushing
		// it, so the tracked deduction must be in Postgres before it runs.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			balance: 400 - usage,
			usage,
		});

		// Upgrade quantity to 400 (prorate_immediately)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
		});

		// Balance should be: 400 (new quantity) + 100 included - usage
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500 - usage,
			usage,
		});

		const upgradeQuantity = 500 - 400;
		const billingUnits = prepaidItem.billing_units ?? 1;
		if (prepaidItem.price == null)
			throw new Error("Missing price on prepaid item");

		if (billingUnits <= 0)
			throw new Error("Billing units must be greater than zero");

		const pricePerUnit = prepaidItem.price;
		const fullUpgradeAmount = new Decimal(upgradeQuantity)
			.div(billingUnits)
			.mul(pricePerUnit)
			.toNumber();
		const frozenTimeMs = Math.floor(advancedTo / 1000) * 1000;
		const expectedLatestTotal = await calculateProratedCharge({
			customerId,
			nowMs: frozenTimeMs,
			amount: fullUpgradeAmount,
		});

		// Should have 2 invoices: initial attach + proration for upgrade. The
		// proration invoice is written asynchronously, so poll for it.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestInvoiceProductId: pro.id,
			latestTotal: expectedLatestTotal,
		});
	},
);

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
