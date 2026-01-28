/**
 * Invoice Created Webhook Tests - Prepaid Price Processing (Legacy Migration)
 *
 * Tests for handling the `invoice.created` Stripe webhook for prepaid prices.
 * These tests verify that prepaid balances reset correctly on cycle renewal.
 *
 * Migrated from:
 * - server/tests/attach/prepaid/prepaid1.test.ts (quantity update, no proration downgrade)
 * - server/tests/attach/prepaid/prepaid3.test.ts (quantity upgrade, prorate next cycle)
 * - server/tests/attach/prepaid/prepaid4.test.ts (basic prepaid reset after usage)
 * - server/tests/attach/prepaid/prepaid6.test.ts (continuous-use seats, downgrade quantity)
 *
 * Key behaviors tested:
 * - Prepaid balance resets to (quantity * billingUnits) on cycle renewal
 * - upcoming_quantity is cleared after cycle renewal
 * - Usage tracking decrements balance correctly
 * - Downgraded quantities take effect at cycle boundary
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductItemQuantity } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid quantity downgrade - balance resets to new quantity on cycle
// (Migrated from prepaid1.test.ts - cycle renewal portion)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300 (billingUnits=100)
 * - Reduce quantity to 200 (sets upcoming_quantity)
 * - Advance to next cycle
 *
 * Expected Result:
 * - Balance resets to 200 (the downgraded quantity)
 * - upcoming_quantity is cleared
 * - Invoice total reflects new quantity pricing
 *
 * Note: The attach quantity change flow (decrease → increase → decrease) is
 * tested separately in attach-update-quantity.test.ts
 */
test.concurrent(`${chalk.yellowBright("invoice.created prepaid: quantity downgrade - balance resets on cycle")}`, async () => {
	const customerId = "inv-created-prepaid-qty-downgrade";

	// Prepaid messages: $12.50 per 100 units, on_decrease: none (sets upcoming_quantity)
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

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach with quantity 300 (billingUnits=100)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			// Reduce quantity to 200 (on_decrease: none, sets upcoming_quantity)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Advance to next invoice cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should reset to 200 (the downgraded quantity)
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(200);

	// Product item should have quantity 200 and no upcoming_quantity
	await expectProductItemQuantity({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Messages,
		quantity: 200, // 200 / 100 billingUnits
	});

	// Should have 2 invoices: initial attach + renewal
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 25 + 20, // 2 units * $12.50 = $25 // includes base price too
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid quantity upgrade with prorate-next-cycle
// (Migrated from prepaid3.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300 (on_increase: prorate_next_cycle)
 * - Track some usage
 * - Upgrade quantity to 400
 * - Advance to next cycle
 *
 * Expected Result:
 * - No immediate invoice for the upgrade (prorate_next_cycle)
 * - Balance resets to 400 on cycle renewal
 */
test.concurrent(`${chalk.yellowBright("invoice.created prepaid: quantity upgrade prorate-next-cycle")}`, async () => {
	const customerId = "inv-created-prepaid-prorate-next";

	// Prepaid messages: $12.50 per 100 units, on_increase: prorate_next_cycle
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

	const { autumnV1, ctx, testClockId } = await initScenario({
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
			// Upgrade quantity to 400 (prorate_next_cycle - no immediate invoice)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
			}),
		],
	});

	// Should still have only 1 invoice (no immediate charge for prorate_next_cycle)
	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpgrade,
		count: 1,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should reset to 400 (the upgraded quantity)
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(400);

	// Should now have 2 invoices (initial + renewal with upgraded quantity)
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 82.5, // 12.5 proration + $20 base + 4 * $12.50
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Basic prepaid reset after usage
// (Migrated from prepaid4.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid messages with quantity 300
 * - Track 100 usage (balance becomes 200)
 * - Advance to next cycle
 *
 * Expected Result:
 * - Balance resets to 300 (original quantity)
 */
test.concurrent(`${chalk.yellowBright("invoice.created prepaid: basic reset after usage")}`, async () => {
	const customerId = "inv-created-prepaid-basic-reset";

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

	const initialQuantity = 300;
	const usage = 100;

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.track({ featureId: TestFeature.Messages, value: usage }),
		],
	});

	// Wait for usage to be processed
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify balance after usage
	const customerAfterUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterUsage.features[TestFeature.Messages].balance).toBe(
		initialQuantity - usage,
	);

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify balance reset
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerFinal.features[TestFeature.Messages].balance).toBe(
		initialQuantity,
	);

	// Verify product is still active
	await expectProductActive({
		customer: customerFinal,
		productId: pro.id,
	});

	// Feature should have correct resets_at
	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: initialQuantity,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Continuous-use seats (Users) with quantity downgrade
// (Migrated from prepaid6.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach prepaid users (seats) with quantity 4 (billingUnits=1)
 * - Use 3 users (track 3)
 * - Downgrade to 3 seats
 * - Advance to next cycle
 *
 * Expected Result:
 * - Balance after usage: 4 - 3 = 1 (or 0 for continuous use)
 * - Balance after cycle: 0 (3 seats - 3 used = 0 available)
 * - Quantity is 3, upcoming_quantity is cleared
 */
test.concurrent(`${chalk.yellowBright("invoice.created prepaid: continuous-use seats downgrade")}`, async () => {
	const customerId = "inv-created-prepaid-seats-downgrade";

	// Prepaid users/seats: $10 per seat, billingUnits=1
	const prepaidUsers = items.prepaid({
		featureId: TestFeature.Users,
		billingUnits: 1,
		includedUsage: 0,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidUsers],
	});

	const initialQuantity = 4;
	const usage = 3;
	const newQuantity = 3;

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: initialQuantity }],
			}),
			s.track({ featureId: TestFeature.Users, value: usage }),
			// Downgrade to 3 seats (with timeout to let usage process)
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: newQuantity }],
				timeout: 3000,
			}),
		],
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should be 0 (3 seats - 3 used = 0 available)
	// For continuous-use features, the usage persists across cycles
	expect(customerFinal.features[TestFeature.Users].balance).toBe(0);

	// Product item should have quantity 3 and no upcoming_quantity
	await expectProductItemQuantity({
		customer: customerFinal,
		productId: pro.id,
		featureId: TestFeature.Users,
		quantity: newQuantity,
	});

	// Latest invoice should be $30 (3 seats * $10)
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2, // initial + renewal
		latestTotal: newQuantity * 10 + 20, // 3 * $10 + $20 base
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
