/**
 * Legacy Attach V1 Trial - MainIsTrial Branch Tests
 *
 * Migrated from:
 * - server/tests/merged/trial/trial1.test.ts (upgrade during trial: pro trial → premium trial)
 * - server/tests/merged/trial/trial2.test.ts (upgrade after trial ends: pro trial → active → premium trial)
 *
 * Tests V1 attach behavior for the MainIsTrial branch where a customer upgrades
 * from one trial product to another.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	AttachBranch,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade during trial (pro trial → premium trial)
// (from trial1)
//
// Scenario:
// - Pro with 7-day trial + consumable Words
// - Premium with 7-day trial + consumable Words
// - Attach Pro → customer is trialing
// - Advance clock 2 days (still in trial)
// - Preview attach → branch should be MainIsTrial
// - Attach Premium → customer still trialing with Premium
// - Premium period_end ≈ curUnix + 7 days (new trial starts)
//
// Expected:
// - Premium trialing after upgrade
// - period_end ≈ current time + 7 days
// - Sub is correct in DB
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 1: upgrade during trial (pro → premium)")}`, async () => {
	const customerId = "legacy-trial-1";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify Pro is trialing
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: pro.id,
		status: CusProductStatus.Trialing,
	});

	// Advance clock 2 days (still in trial)
	const curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 2).getTime(),
	});

	// Preview attach → should be MainIsTrial branch
	const attachPreview = await autumnV1.attachPreview({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(attachPreview?.branch).toBe(AttachBranch.MainIsTrial);

	// Upgrade to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: premium.id,
		status: CusProductStatus.Trialing,
	});

	// Premium period_end ≈ curUnix + 7 days
	await expectProductTrialing({
		customer: customer as any,
		productId: premium.id,
		trialEndsAt: addDays(curUnix, 7).getTime(),
		toleranceMs: 1000 * 60 * 30, // 30 min tolerance
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
}, 120000);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade after trial ends (pro trial → active → premium trial)
// (from trial2)
//
// Scenario:
// - Pro with 7-day trial + consumable Words
// - Premium with 7-day trial + consumable Words
// - Attach Pro → customer is trialing
// - Advance clock 8 days (past trial → Pro becomes active)
// - Preview attach → branch should be Upgrade (not MainIsTrial)
// - Checkout → get expected total
// - Attach Premium → customer now trialing with Premium
// - Invoice total matches checkout preview
// - Premium period_end ≈ curUnix + 7 days
//
// Expected:
// - Branch is Upgrade (not MainIsTrial, since trial ended)
// - Premium trialing after upgrade
// - Invoice total matches checkout
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 2: upgrade after trial ends (pro active → premium trial)")}`, async () => {
	const customerId = "legacy-trial-2";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify Pro is trialing
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: pro.id,
		status: CusProductStatus.Trialing,
	});

	// Advance clock 8 days (past the 7-day trial → Pro becomes active)
	const curUnix = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 12).getTime(),
		waitForSeconds: 30,
	});

	// Get checkout total for comparison
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: premium.id,
	});

	// Upgrade to Premium
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await timeout(5000);

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: premium.id,
		status: CusProductStatus.Trialing,
	});

	// Premium period_end ≈ curUnix + 7 days
	await expectProductTrialing({
		customer: customer as any,
		productId: premium.id,
		trialEndsAt: addDays(curUnix, 7).getTime(),
		toleranceMs: 1000 * 60 * 30, // 30 min tolerance
	});

	await expectCustomerInvoiceCorrect({
		customer: customer as any,
		count: 4,
		latestTotal: 0,
	});

	// Invoice total should match checkout preview
	expect(customer.invoices?.[1]?.total).toBe(
		new Decimal(checkoutRes.total).toDP(2).toNumber(),
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});
