/**
 * Invoice Created - Free Entitlement Reset Tests
 *
 * Verifies that free (non-price-backed) entitlements with the same interval as
 * a customer's Stripe subscription are reset via the invoice.created webhook
 * rather than the lazy/cron path. This eliminates timing drift between paid
 * and free resets.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiCustomerV3,
	type LimitedItem,
	ProductItemInterval,
} from "@autumn/shared";
import { subDays, subMonths } from "date-fns";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import chalk from "chalk";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free entitlement resets via invoice.created webhook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (paid) AND a free words feature
 *   (entitlement-only, no price) on the same product
 * - Track some words usage, then advance to next billing cycle
 *
 * Expected:
 * - Words balance resets to full allowance via webhook
 * - next_reset_at moves to subscription period end
 */
test(`${chalk.yellowBright("invoice.created free reset: free entitlement resets via webhook when matching sub interval")}`, async () => {
	const customerId = "inv-created-free-reset";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const freeWordsItem = items.monthlyWords({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem, freeWordsItem],
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id, timeout: 2000 }),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 2000 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	await pause(2000);

	const customerAfter =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Free words balance should be reset to full allowance
	expect(customerAfter.features[TestFeature.Words].balance).toBe(500);

	// Product should still be active
	await expectProductActive({ customer: customerAfter, productId: pro.id });

	// next_reset_at should be in the future (set to subscription period end)
	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Words,
	});
	expect(cusEnt).toBeDefined();
	expect(cusEnt!.next_reset_at).toBeGreaterThan(Date.now());
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free entitlement NOT reset by lazy when matching subscription exists
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (paid) + free words (entitlement-only)
 * - Expire the words cusEnt's next_reset_at, then GET customer
 *
 * Expected:
 * - Words balance is NOT reset (lazy skipped it — webhook owns this interval)
 */
test(`${chalk.yellowBright("invoice.created free reset: lazy reset skips free entitlement when matching sub exists")}`, async () => {
	const customerId = "inv-created-free-no-lazy";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const freeWordsItem = items.monthlyWords({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem, freeWordsItem],
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id, timeout: 3000 }),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 3000 }),
		],
	});

	await pause(3000);

	// Verify usage was tracked
	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Words].current_balance).toBe(400);

	// Find the paid cusEnt to get its reset day (= subscription period end day)
	const paidCusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Expire words to a past date on the SAME day-of-month as the paid period end.
	const alignedPastMs = subMonths(paidCusEnt!.next_reset_at!, 1).getTime();
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Words,
		pastTimeMs: alignedPastMs,
	});

	// GET customer — lazy reset should NOT fire (same interval + same reset day)
	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(after.balances[TestFeature.Words].current_balance).toBe(400);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Different-interval free entitlement still resets via lazy (regression)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro (monthly sub) with consumable messages + WEEKLY words feature
 * - Expire the words cusEnt, then GET customer
 *
 * Expected:
 * - Words balance IS reset (weekly != monthly, so lazy handles it normally)
 */
test(`${chalk.yellowBright("invoice.created free reset: different-interval free ent still resets lazily")}`, async () => {
	const customerId = "inv-created-free-diff-int";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const weeklyWordsItem = constructFeatureItem({
		featureId: TestFeature.Words,
		includedUsage: 500,
		interval: ProductItemInterval.Week,
	}) as LimitedItem;
	const pro = products.pro({
		id: "pro",
		items: [consumableItem, weeklyWordsItem],
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id, timeout: 3000 }),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 3000 }),
		],
	});

	await pause(3000);

	// Expire the free cusEnt's next_reset_at
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Words,
	});

	// GET customer — lazy reset SHOULD fire (weekly != monthly sub)
	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});

	// Balance should be fully reset (weekly interval not blocked by monthly sub)
	expect(after.balances[TestFeature.Words].current_balance).toBe(500);
	expect(after.balances[TestFeature.Words].usage).toBe(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Same interval but misaligned cycles — lazy reset still fires
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro (monthly sub) with consumable messages + free monthly words
 * - Manually expire the words cusEnt to 3 days before the paid ent's next_reset_at
 *   (>24h apart = misaligned)
 *
 * Expected:
 * - Words balance IS reset via lazy (not blocked, cycles aren't aligned)
 */
test(`${chalk.yellowBright("invoice.created free reset: same interval but misaligned cycle still resets lazily")}`, async () => {
	const customerId = "inv-created-free-misalign";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const freeWordsItem = items.monthlyWords({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem, freeWordsItem],
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id, timeout: 3000 }),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 3000 }),
		],
	});

	await pause(3000);

	// Expire to 3 days ago — past due AND different day-of-month than the paid
	// ent's period end (~1 month away), so cycles are misaligned.
	const threeDaysAgo = subDays(Date.now(), 3).getTime();
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Words,
		pastTimeMs: threeDaysAgo,
	});

	// GET customer — lazy reset SHOULD fire (same interval but >24h misaligned)
	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(after.balances[TestFeature.Words].current_balance).toBe(500);
	expect(after.balances[TestFeature.Words].usage).toBe(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Paid entitlement behavior unchanged (regression)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (monthly, price-backed)
 * - Track overage usage, advance to next cycle
 *
 * Expected:
 * - Messages balance resets (same as before — price-backed path unchanged)
 */
test(`${chalk.yellowBright("invoice.created free reset: paid entitlement reset unchanged (regression)")}`, async () => {
	const customerId = "inv-created-free-paid-reg";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [consumableItem] });

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id, timeout: 2000 }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfter =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages balance should be reset to full allowance (price-backed path)
	expect(customerAfter.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: customerAfter, productId: pro.id });
});
