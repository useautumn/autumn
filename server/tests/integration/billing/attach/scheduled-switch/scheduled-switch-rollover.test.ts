/**
 * Scheduled Switch Rollover Tests (Attach V2)
 *
 * Tests for rollover behavior during downgrade scenarios.
 *
 * Key behaviors:
 * - Downgrades are scheduled for end of billing cycle
 * - At cycle end: rollovers are carried over if new plan has rollover config
 * - Carried-over rollover follows the NEW plan's limitations (cap)
 * - If new plan has NO rollover config, NO rollovers are carried over
 *
 * NOTE: Pro products have free messages (no usage-based billing), so we use
 * s.resetFeature() to simulate cycle reset and create rollovers.
 * Then s.advanceToNextInvoice() triggers the scheduled plan switch.
 */

import { test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectCustomerRolloverCorrect,
	expectNoRollovers,
} from "@tests/integration/billing/utils/rollover/expectCustomerRolloverCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Downgrade with rollover carryover (same cap)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 500 messages + rollover (max: 500)
 * - Use 300 messages, reset cycle → 200 rollover created
 * - Schedule downgrade to free with 100 messages + rollover (max: 500)
 * - Advance to next cycle to trigger downgrade
 *
 * Expected Result:
 * - Rollover of 200 carries over to free
 * - Total balance = 100 (free included) + 200 (rollover) = 300
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 1: downgrade with rollover carryover (same cap)")}`, async () => {
	const customerId = "sched-switch-rollover-same-cap";

	// Pro plan: 500 messages with rollover (max: 500)
	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Free plan: 100 messages with rollover (max: 500 - same cap)
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	// Setup: attach pro, track usage, reset to create rollover, schedule downgrade, advance to trigger
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }), // Creates rollover of 200 (500 - 300)
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice(), // Triggers downgrade at cycle end
		],
	});

	// Verify rollover carried over to free
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Balance = 100 (free included) + 200 (rollover) = 300
	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 300,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 200 }],
		totalBalance: 300,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade with rollover capped by new plan's lower max
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 500 messages + rollover (max: 500)
 * - Use 100 messages, reset cycle → 400 rollover created
 * - Schedule downgrade to free with 100 messages + rollover (max: 150 - LOWER cap)
 * - Advance to next cycle to trigger downgrade
 *
 * Expected Result:
 * - Rollover is CAPPED at new plan's max (150), not 400
 * - Total balance = 100 (free included) + 150 (capped rollover) = 250
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 2: downgrade with rollover capped by lower max")}`, async () => {
	const customerId = "sched-switch-rollover-lower-cap";

	// Pro plan: 500 messages with rollover (max: 500)
	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Free plan: 100 messages with rollover (max: 150 - LOWER cap)
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: {
			max: 150,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	// Setup: attach pro, track low usage to create large rollover, reset, schedule downgrade, advance
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }), // Creates rollover of 400 (500 - 100)
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice(), // Triggers downgrade at cycle end
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify rollover CAPPED at free's max (150)
	// Balance = 100 (free included) + 150 (capped rollover) = 250
	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 250,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }], // Capped from 400 to 150
		totalBalance: 250,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade where new plan has NO rollover config
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 500 messages + rollover (max: 500)
 * - Use 300 messages, reset cycle → 200 rollover created
 * - Schedule downgrade to free with 100 messages + NO rollover config
 * - Advance to next cycle to trigger downgrade
 *
 * Expected Result:
 * - NO rollovers carried over (free doesn't support rollovers)
 * - Total balance = 100 (free included only)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-rollover 3: downgrade to plan without rollover - no carryover")}`, async () => {
	const customerId = "sched-switch-rollover-no-rollover";

	// Pro plan: 500 messages with rollover
	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Free plan: 100 messages WITHOUT rollover
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	// Setup: attach pro, track usage, reset to create rollover, schedule downgrade, advance
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }), // Creates rollover of 200
			s.billing.attach({ productId: free.id }), // Schedule downgrade
			s.advanceToNextInvoice(), // Triggers downgrade at cycle end
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		active: [free.id],
		notPresent: [pro.id],
	});

	// NO rollovers (free doesn't support them)
	// Balance = 100 (free included only)
	expectCustomerFeatureCorrect({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectNoRollovers({
		customer: customerAfterDowngrade,
		featureId: TestFeature.Messages,
	});
});
