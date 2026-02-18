/**
 * Transition Config Error Tests (Attach V2)
 *
 * Tests for validation errors when using transition configs incorrectly.
 *
 * Key behaviors:
 * - reset_after_trial_end is not allowed on allocated features (continuous_use)
 * - Allocated features don't have next_reset_at, so the config is meaningless
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: reset_after_trial_end on allocated feature (free)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has freeAllocatedWorkflows (continuous_use feature with no price)
 * - Customer tries to attach with reset_after_trial_end: true for workflows
 *
 * Expected Result:
 * - Error thrown: reset_after_trial_end is not supported for allocated features
 *
 * Why:
 * - Allocated features (continuous_use) don't have next_reset_at
 * - They represent things like seats/workflows that don't reset on billing cycles
 * - reset_after_trial_end would be meaningless for these features
 */
test.concurrent(`${chalk.yellowBright("transition-config-errors 1: reset_after_trial_end on allocated feature (free)")}`, async () => {
	const customerId = "trans-config-err-allocated-free";

	const pro = products.pro({
		id: "pro-allocated-workflows",
		items: [items.freeAllocatedWorkflows({ includedUsage: 5 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attempt to attach with reset_after_trial_end on allocated feature should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: TestFeature.Workflows,
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: [TestFeature.Workflows],
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: reset_after_trial_end on allocated feature (paid)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has allocatedUsers (continuous_use feature with prorated pricing)
 * - Customer tries to attach with reset_after_trial_end: true for users
 *
 * Expected Result:
 * - Error thrown: reset_after_trial_end is not supported for allocated features
 */
test.concurrent(`${chalk.yellowBright("transition-config-errors 2: reset_after_trial_end on allocated feature (paid)")}`, async () => {
	const customerId = "trans-config-err-allocated-paid";

	const pro = products.pro({
		id: "pro-allocated-users",
		items: [items.allocatedUsers({ includedUsage: 0 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attempt to attach with reset_after_trial_end on allocated feature should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: [TestFeature.Users],
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: feature options for non-existent feature
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has allocatedUsers feature
 * - Customer tries to attach with options for a feature that doesn't exist on the product
 *
 * Expected Result:
 * - Error thrown: feature_id in options doesn't match any feature on the product
 */
test.concurrent(`${chalk.yellowBright("transition-config-errors 3: feature options for non-existent feature")}`, async () => {
	const customerId = "trans-config-err-nonexistent-feature";

	const pro = products.pro({
		id: "pro-users-only",
		items: [items.allocatedUsers({ includedUsage: 0 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attempt to attach with options for a feature that doesn't exist on the product
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: "random-nonexistent-feature",
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: ["random-nonexistent-feature"],
				},
			});
		},
	});
});
