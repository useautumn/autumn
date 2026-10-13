/**
 * Attach Update Quantity Tests (Legacy Migration): mid-cycle attach quantity changes and entity-level
 * prepaid add-ons (migrated from server/tests/attach/prepaid/prepaid2.test.ts and prepaid5.test.ts).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { calculateProratedCharge } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
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
					timeout: 5000, // Wait for proration invoice
				}),
				s.track({ featureId: TestFeature.Messages, value: usage }),
				// Advance 2 weeks (mid-cycle)
				s.advanceTestClock({ weeks: 2 }),
				// Upgrade quantity to 400 (prorate_immediately)
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
					timeout: 5000, // Wait for proration invoice
				}),
			],
		});

		// Verify final state
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance should be: 400 (new quantity) - usage
		expect(customerFinal.features[TestFeature.Messages].balance).toBe(
			500 - usage,
		);

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

		// Should have 2 invoices: initial attach + proration for upgrade
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 2,
			latestInvoiceProductId: pro.id,
			latestTotal: expectedLatestTotal,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500 - usage,
			usage: usage,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Quantity upgrade with prorate-next-cycle (no immediate invoice)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300 (on_increase: prorate_next_cycle)
 * - Track some usage
 * - Upgrade quantity to 400 (prorate_next_cycle - deferred billing)
 *
 * Expected Result:
 * - Balance stays at 300 - usage (no immediate increase for prorate_next_cycle)
 * - Only 1 invoice (initial attach, no proration invoice)
 * - Subscription item quantity is updated to 4 immediately
 * - Product item quantity shows 4 (the new quantity takes effect on Stripe)
 */
test.concurrent(
	`${chalk.yellowBright("attach: quantity upgrade with prorate-next-cycle")}`,
	async () => {
		const customerId = "attach-qty-upgrade-prorate-next";

		const prepaidItem = items.prepaidMessages({
			billingUnits: 100,
			price: 12.5,
			config: {
				on_increase: OnIncrease.ProrateNextCycle,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const usage = Math.floor(Math.random() * 220); // Random usage between 0-219

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: usage,
					timeout: 2000,
				}),
				// Upgrade quantity to 400 (prorate_next_cycle - no immediate invoice)
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
				}),
			],
		});

		// Verify final state
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance should be: 400 (new quantity) - usage
		// With prorate_next_cycle, balance is updated immediately but billing is deferred
		expect(customerFinal.features[TestFeature.Messages].balance).toBe(
			400 - usage,
		);

		// Should have only 1 invoice (initial attach, no proration invoice)
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 1,
		});

		// Product item quantity should be 4 (400 / 100 billingUnits)
		await expectProductItemCorrect({
			customer: customerFinal,
			productId: pro.id,
			featureId: TestFeature.Messages,
			quantity: 400,
			upcomingQuantity: "undefined", // No upcoming_quantity since it's an upgrade
		});

		// Verify Stripe subscription has correct item quantity
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
