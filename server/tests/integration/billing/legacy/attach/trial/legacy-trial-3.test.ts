/**
 * Legacy Attach V1 Trial Tests - Slice 3 of 3
 *
 * Migrated from:
 * - server/tests/attach/upgradeOld/upgradeOld2.test.ts (paid to trial upgrade)
 * - server/tests/attach/upgradeOld/upgradeOld3.test.ts (trial to trial upgrade)
 * - server/tests/attach/others/others7.test.ts (skip trial with free_trial=false)
 *
 * Tests V1 attach behavior for trial-related scenarios:
 * - Paid to trial upgrade
 * - Trial to trial upgrade with time advancement
 * - Skipping the trial with free_trial=false
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

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

test.concurrent(
	`${chalk.yellowBright("legacy-trial 5: paid to trial upgrade")}`,
	async () => {
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

		// Stripe issues the $0 trial invoice via webhook, so poll for the settled set:
		// Pro paid ($20) + pro refund (-$20) + Premium trial ($0).
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 3,
			latestTotal: 0, // Premium trial - $0
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

		expect(customerAfterPremium.invoices?.[1].total).toBe(-20); // refund for pro
	},
);

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

test.concurrent(
	`${chalk.yellowBright("legacy-trial 6: trial to trial upgrade with time advancement")}`,
	async () => {
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
	},
);

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

test.concurrent(
	`${chalk.yellowBright("legacy-trial 7: skip trial with free_trial=false")}`,
	async () => {
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
	},
);
