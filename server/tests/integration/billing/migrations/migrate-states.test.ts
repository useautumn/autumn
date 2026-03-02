/**
 * Migration State Preservation Tests
 *
 * Tests for preserving cancellation and downgrade states during migration.
 * These states must be preserved to avoid unexpected billing changes.
 *
 * Key behaviors:
 * - Pending cancellation is preserved
 * - Scheduled downgrade is preserved
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForMigration = (ms = 20000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pending Cancellation Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro
 * - Customer cancels at end of cycle
 * - Product updated to v2
 * - Migrate customer
 *
 * Expected Result:
 * - Cancellation is preserved
 * - Customer still scheduled to cancel at end of cycle
 */
test.concurrent(`${chalk.yellowBright("migrate-states-1: pending cancellation preserved")}`, async () => {
	const customerId = "migrate-states-cancel";

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
			s.billing.attach({ productId: "pro", timeout: 10000 }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 4000 }),
			s.updateSubscription({
				productId: "pro",
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify cancellation state before migration
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: pro.id,
	});

	// Update product to v2
	const monthlyPrice = items.monthlyPrice({ price: 20 });
	const v2Items = [monthlyPrice, items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(pro.id, { items: v2Items });

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

	// Product should still be active but canceling
	await expectCustomerProducts({
		customer,
		canceling: [pro.id],
	});

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Scheduled Downgrade Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium
 * - Customer downgrades to pro (scheduled for end of cycle)
 * - Premium product updated to v2
 * - Migrate customer
 *
 * Expected Result:
 * - Scheduled downgrade preserved
 * - Premium is active (canceling), pro is scheduled
 */
test.concurrent(`${chalk.yellowBright("migrate-states-2: scheduled downgrade preserved")}`, async () => {
	const customerId = "migrate-states-downgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: "premium", timeout: 10000 }),
			s.track({ featureId: TestFeature.Messages, value: 200, timeout: 4000 }),
			s.billing.attach({ productId: "pro" }), // Downgrade - scheduled
		],
	});

	// Verify downgrade state before migration
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Update premium product to v2
	const monthlyPrice = items.monthlyPrice({ price: 20 });
	const v2Items = [
		monthlyPrice,
		items.monthlyMessages({ includedUsage: 1200 }),
	];
	await autumnV1.products.update(premium.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: premium.id,
		to_product_id: premium.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should still be active but canceling
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	// Pro should still be scheduled
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Usage preserved with new included usage
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1200, // v2 premium
		balance: 1000, // 1200 - 200
		usage: 200,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
