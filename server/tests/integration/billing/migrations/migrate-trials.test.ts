/**
 * Migration Trial Tests
 *
 * Tests for trial state preservation during migration.
 * Trials should maintain their end dates and not reset.
 *
 * Key behaviors:
 * - Mid-trial migration preserves trial days remaining
 * - Trial end date is unchanged
 * - Past trial customers don't get new trial on migration
 * - Paid customers don't get trial when v2 adds trial
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const TEN_MINUTES_MS = 10 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Mid-Trial Migration (Trial Days Preserved)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with 7-day trial
 * - Advance 3 days (4 days remaining)
 * - Product updated to v2
 * - Migrate customer
 *
 * Expected Result:
 * - Trial end date UNCHANGED
 * - Customer still in trial with same end date
 */
test.concurrent(`${chalk.yellowBright("migrate-trials-1: mid-trial migration preserves trial days")}`, async () => {
	const customerId = "migrate-trials-mid";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: 7,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.advanceTestClock({ days: 3 }), // 4 days remaining
		],
	});

	// Get trial end date before migration (using current_period_end)
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const productBefore = customer.products?.find((p) => p.id === proTrial.id);
	expect(productBefore?.status).toBe("trialing");
	const trialEndBefore = productBefore?.current_period_end;
	expect(trialEndBefore).toBeDefined();

	// Update product to v2
	const v2Items = [items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(proTrial.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: proTrial.id,
		to_product_id: proTrial.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id],
	});

	// Should still be in trial with same end date (within tolerance)
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: trialEndBefore!,
		toleranceMs: TEN_MINUTES_MS,
	});

	// Features updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Trial with Usage, Mid-Trial Migration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with 7-day trial
 * - Customer uses 100 messages
 * - Advance 4 days
 * - Migrate to v2 with 600 messages
 *
 * Expected Result:
 * - Usage carried over
 * - Trial end date unchanged
 */
test.concurrent(`${chalk.yellowBright("migrate-trials-2: trial with usage, mid-trial migration")}`, async () => {
	const customerId = "migrate-trials-usage";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: 7,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.advanceTestClock({ days: 4 }),
		],
	});

	// Get trial end date before migration
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const productBefore = customer.products?.find((p) => p.id === proTrial.id);
	const trialEndBefore = productBefore?.current_period_end;

	// Update product to v2
	const v2Items = [items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(proTrial.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: proTrial.id,
		to_product_id: proTrial.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial end date unchanged (within tolerance)
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: trialEndBefore!,
		toleranceMs: TEN_MINUTES_MS,
	});

	// Usage carried over
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Past Trial End, Migration (No New Trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with 7-day trial
 * - Advance past trial end (10 days)
 * - Migrate to v2
 *
 * Expected Result:
 * - Customer NOT on new trial
 * - Customer is now paying
 */
test.concurrent(`${chalk.yellowBright("migrate-trials-3: past trial end, no new trial on migration")}`, async () => {
	const customerId = "migrate-trials-past";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.advanceTestClock({ days: 10 }), // Past trial (7 days)
		],
	});

	// Verify customer is past trial
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Update product to v2
	const v2Items = [items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(proTrial.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: proTrial.id,
		to_product_id: proTrial.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should NOT be on a new trial
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Features updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Paid Customer, V2 Adds Trial (No Trial for Existing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro (no trial) - already paying
 * - Product updated to v2 with 7-day trial
 * - Migrate customer
 *
 * Expected Result:
 * - Existing paid customer does NOT get trial
 * - Subscription continues normally
 */
test.concurrent(`${chalk.yellowBright("migrate-trials-4: paid customer, v2 adds trial - no trial for existing")}`, async () => {
	const customerId = "migrate-trials-no-trial";

	// Pro without trial
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	// Verify customer is active (not trial)
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const productBefore = customer.products?.find((p) => p.id === pro.id);
	expect(productBefore?.status).not.toBe("trialing");

	// Update product to v2 WITH trial (using proWithTrial structure)
	// We'll add the free_trial config to the product
	await autumnV1.products.update(pro.id, {
		items: [items.monthlyMessages({ includedUsage: 600 })],
		free_trial: {
			length: 7,
			duration: "day",
			unique_fingerprint: false,
			card_required: true,
		},
	});

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
	});

	// Existing customer should NOT get trial
	const productAfter = customer.products?.find((p) => p.id === pro.id);
	expect(productAfter?.status).not.toBe("trialing");

	// Usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
