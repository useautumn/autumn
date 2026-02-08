/**
 * Immediate Switch Rollover Tests (Attach V2)
 *
 * Tests for rollover behavior during upgrade scenarios.
 *
 * Key behaviors:
 * - Rollovers are ONLY carried over if the new plan's feature has rollovers ENABLED
 * - Carried-over rollover follows the NEW plan's limitations (cap)
 * - If new plan has NO rollover config, NO rollovers are brought over
 *
 * NOTE: Free products use s.resetFeature() to create rollovers (no Stripe subscription)
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
// TEST 1: Upgrade with rollover carryover (same cap)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with 400 messages + rollover (max: 500)
 * - Use 250 messages, reset cycle → 150 rollover created
 * - Upgrade to pro product with 500 messages + rollover (max: 500)
 *
 * Expected Result:
 * - Rollover of 150 carries over to pro
 * - Total balance = 500 (pro included) + 150 (rollover) = 650
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 1: upgrade with rollover carryover (same cap)")}`, async () => {
	const customerId = "imm-switch-rollover-same-cap";

	// Free plan: 400 messages with rollover (max: 500)
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
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

	// Pro plan: 500 messages with rollover (max: 500 - same cap)
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

	// Setup: attach free, track usage, reset to create rollover
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	// Verify rollover created
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After reset: balance = 400 (new cycle) + 150 (rollover) = 550
	expectCustomerFeatureCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		balance: 550,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	// Upgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Verify rollover carried over to pro
	// Balance = 500 (pro included) + 150 (rollover) = 650
	// Note: included_usage in V1.2 API currently includes rollovers (650), not just base (500)
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 650,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
		totalBalance: 650,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade with rollover capped by new plan's lower max
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with 400 messages + rollover (max: 500)
 * - Use 50 messages, reset cycle → 350 rollover created
 * - Upgrade to pro product with 500 messages + rollover (max: 200 - LOWER cap)
 *
 * Expected Result:
 * - Rollover is CAPPED at new plan's max (200), not 350
 * - Total balance = 500 (pro included) + 200 (capped rollover) = 700
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 2: upgrade with rollover capped by lower max")}`, async () => {
	const customerId = "imm-switch-rollover-lower-cap";

	// Free plan: 400 messages with rollover (max: 500)
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
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

	// Pro plan: 500 messages with rollover (max: 200 - LOWER cap)
	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 200,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Setup: attach free, track low usage to create large rollover, reset
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	// Verify rollover created (350)
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 350 }],
	});

	// Upgrade to pro (which has max: 200)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Verify rollover CAPPED at pro's max (200)
	// Balance = 500 (pro included) + 200 (capped rollover) = 700
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 700,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 200 }], // Capped from 350 to 200
		totalBalance: 700,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade with rollover - new plan has higher cap
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with 400 messages + rollover (max: 200)
 * - Use 250 messages, reset cycle → 150 rollover created
 * - Upgrade to pro product with 500 messages + rollover (max: 1000 - HIGHER cap)
 *
 * Expected Result:
 * - Full rollover of 150 carries over (within pro's higher cap)
 * - Total balance = 500 (pro included) + 150 (rollover) = 650
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 3: upgrade with rollover - higher cap allows full carryover")}`, async () => {
	const customerId = "imm-switch-rollover-higher-cap";

	// Free plan: 400 messages with rollover (max: 200 - lower cap)
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig: {
			max: 200,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	// Pro plan: 500 messages with rollover (max: 1000 - HIGHER cap)
	const proMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig: {
			max: 1000,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Setup: attach free, track usage, reset to create rollover
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	// Verify rollover created (150)
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	// Upgrade to pro (which has max: 1000)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Full rollover carries over (150 < 1000 cap)
	// Balance = 500 (pro included) + 150 (rollover) = 650
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 650,
	});

	expectCustomerRolloverCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
		totalBalance: 650,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade where new plan has NO rollover config
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with 400 messages + rollover (max: 500)
 * - Use 250 messages, reset cycle → 150 rollover created
 * - Upgrade to pro product with 500 messages + NO rollover config
 *
 * Expected Result:
 * - NO rollovers carried over (pro doesn't support rollovers)
 * - Total balance = 500 (pro included only)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-rollover 4: upgrade to plan without rollover - no carryover")}`, async () => {
	const customerId = "imm-switch-rollover-no-rollover";

	// Free plan: 400 messages with rollover
	const freeMessagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
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

	// Pro plan: 500 messages WITHOUT rollover
	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Setup: attach free, track usage, reset to create rollover
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	// Verify rollover exists on free plan
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerRolloverCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		expectedRollovers: [{ balance: 150 }],
	});

	// Upgrade to pro (which has NO rollover config)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [pro.id],
		notPresent: [free.id],
	});

	// NO rollovers (pro doesn't support them)
	// Balance = 500 (pro included only)
	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	expectNoRollovers({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
	});
});
