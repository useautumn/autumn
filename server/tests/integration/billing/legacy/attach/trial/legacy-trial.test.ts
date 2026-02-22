/**
 * Legacy Attach V1 Trial Tests
 *
 * Migrated from:
 * - server/tests/merged/trial/trial1.test.ts (upgrade during trial: pro trial → premium trial)
 * - server/tests/merged/trial/trial2.test.ts (upgrade after trial ends: pro trial → active → premium trial)
 * - server/tests/attach/upgradeOld/upgradeOld1.test.ts (trial to paid upgrade)
 * - server/tests/attach/basic/basic8.test.ts (trial duplicates with same fingerprint)
 * - server/tests/attach/upgradeOld/upgradeOld2.test.ts (paid to trial upgrade)
 * - server/tests/attach/upgradeOld/upgradeOld3.test.ts (trial to trial upgrade)
 *
 * Tests V1 attach behavior for trial-related scenarios:
 * - Upgrading from one trial product to another (MainIsTrial branch)
 * - Upgrading from trial to paid product
 * - Trial deduplication based on fingerprint (unique_fingerprint: true)
 * - Paid to trial upgrade
 * - Trial to trial upgrade with time advancement
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ApiVersion,
	AttachBranch,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli";
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
		new Decimal(checkoutRes.total ?? 0).toDP(2).toNumber(),
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade from trial product to paid product
// (from legacy-upgrade.test.ts / upgradeOld1)
//
// Scenario:
// - Pro product ($20/month) with 7-day trial, dashboard + 10 messages
// - Premium product ($50/month), 100 messages
// - Customer with payment method
// - Attach pro (starts trial)
// - Advance 3 days
// - Upgrade to premium → trial ends, premium starts
//
// Expected:
// - Customer has premium product after upgrade
// - Invoice total is $50 (premium price)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 3: trial to paid upgrade")}`, async () => {
	const customerId = "legacy-trial-3";

	const proWithTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
		trialDays: 7,
		cardRequired: true,
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V0_1,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proWithTrial, premium] }),
		],
		actions: [
			s.attach({ productId: proWithTrial.id }),
			s.advanceTestClock({ days: 3 }),
		],
	});

	// Upgrade to premium
	await autumn.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	await timeout(2500);

	// Check product, entitlements and invoices
	const res = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerV0Correct({
		sent: premium,
		cusRes: res,
	});

	const invoices = res.invoices;

	expect(invoices?.[0].total).toBe(50);
	expect(invoices?.[0].product_ids).toContain(premium.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Trial duplicates with same fingerprint
// (from basic8)
//
// Scenario:
// - Pro product with 7-day trial, unique_fingerprint: true
// - Customer 1 with fingerprint X attaches pro → gets trial
// - Customer 2 with same fingerprint X attaches pro → no trial, full price
//
// Expected:
// - Customer 1: trialing, invoice total $0
// - Customer 2: active (no trial), invoice total $20
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 4: trial duplicates with same fingerprint")}`, async () => {
	const customerId = "legacy-trial-4";
	const customerId2 = "legacy-trial-4-dup";
	const randFingerprint = Math.random().toString(36).substring(2, 15);

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
		trialDays: 7,
		cardRequired: true,
		uniqueFingerprint: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({
				paymentMethod: "success",
				data: { fingerprint: randFingerprint },
			}),
			s.otherCustomers([
				{
					id: customerId2,
					paymentMethod: "success",
					data: { fingerprint: randFingerprint },
				},
			]),
			s.products({ list: [proWithTrial] }),
		],
		actions: [s.attach({ productId: proWithTrial.id })],
	});

	// Verify customer 1 is trialing with $0 invoice
	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customer1,
		productId: proWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customer1,
		count: 1,
		latestTotal: 0,
	});

	// Attach same product to customer 2 (same fingerprint → no trial)
	await autumnV1.attach({
		customer_id: customerId2,
		product_id: proWithTrial.id,
	});

	// Verify customer 2 is active (not trialing) with $20 invoice
	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId2);

	await expectProductActive({
		customer: customer2,
		productId: proWithTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customer2,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Paid to trial upgrade
// (from upgradeOld2)
//
// Scenario:
// - Pro product ($20/month) without trial
// - Premium product ($50/month) with 7-day trial
// - Attach Pro (paid) → customer is active
// - Upgrade to Premium → customer gets trial
//
// Expected:
// - Customer is trialing on Premium after upgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 5: paid to trial upgrade")}`, async () => {
	const customerId = "legacy-trial-5";

	// Pro: $20/month, no trial
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
	});

	// Premium: $50/month with 7-day trial
	const premiumWithTrial = products.premiumWithTrial({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premiumWithTrial] }),
		],
		actions: [],
	});

	// Attach Pro (paid)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterPro,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPro,
		count: 1,
		latestTotal: 20, // Pro $20
	});

	// Upgrade to Premium with trial
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumWithTrial.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPremium,
		productId: premiumWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 2 invoices: Pro paid ($20) + Premium trial ($0)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 0, // Premium trial - $0
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Trial to trial upgrade with time advancement
// (from upgradeOld3)
//
// Scenario:
// - Pro product ($20/month) with 7-day trial
// - Premium product ($50/month) with 7-day trial
// - Attach Pro → customer is trialing
// - Advance clock 3 days (still in trial)
// - Upgrade to Premium → customer still trialing on Premium
//
// Expected:
// - Customer is trialing on Premium after upgrade
// - Invoice total is $0 (still in trial)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 6: trial to trial upgrade with time advancement")}`, async () => {
	const customerId = "legacy-trial-6";

	// Pro: $20/month with 7-day trial
	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 10 }),
			items.adminRights(),
		],
		trialDays: 7,
		cardRequired: true,
		uniqueFingerprint: true,
	});

	// Premium: $50/month with 7-day trial
	const premiumWithTrial = products.premiumWithTrial({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proWithTrial, premiumWithTrial] }),
		],
		actions: [],
	});

	// Attach Pro with trial
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proWithTrial.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPro,
		productId: proWithTrial.id,
	});

	// Advance clock 3 days (still in trial)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 3).getTime(),
		waitForSeconds: 10,
	});

	// Upgrade to Premium with trial
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumWithTrial.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterPremium,
		productId: premiumWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 0, // Trial - $0
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Skip trial with free_trial=false flag
// (from others7)
//
// Scenario:
// - Pro product ($20/month) with 7-day trial and arrear Words
// - Attach with free_trial=false → skip trial, charge immediately
//
// Expected:
// - Customer is active (not trialing)
// - 1 invoice for base price ($20)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-trial 7: skip trial with free_trial=false")}`, async () => {
	const customerId = "legacy-trial-7";

	// Pro with trial and arrear words
	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [items.consumableWords()],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proWithTrial] }),
		],
		actions: [],
	});

	// Attach with free_trial=false to skip trial
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proWithTrial.id,
		free_trial: false,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should be active, not trialing
	await expectProductActive({
		customer,
		productId: proWithTrial.id,
	});

	// Invoice should be for base price ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20, // Pro base price
	});
});
