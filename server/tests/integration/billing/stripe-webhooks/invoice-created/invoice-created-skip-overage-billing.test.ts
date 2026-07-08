/**
 * TDD test for per-feature `skip_overage_billing` on spend_limit billing controls.
 *
 * Contract under test:
 *   New types/fields:
 *     - DbSpendLimit.skip_overage_billing?: boolean — settable on plan
 *       billing_controls (create/update plan), customer billing_controls
 *       (customers.update), and entity billing_controls.
 *   New behaviors (invoice.created renewal invoices):
 *     - Feature whose resolved spend_limit entry (entity > customer > plan)
 *       has skip_overage_billing: true → consumable overage line item is NOT
 *       posted to Stripe. Features without it are billed normally.
 *     - Balances still reset on the billing cycle for skipped features.
 *     - Plan-level control acts as a default; a customer-level entry for the
 *       same feature OVERRIDES it entirely (e.g. flips skip back to billed).
 *     - Works when the included allowance lives on the main plan and the
 *       consumable overage price lives on an add-on, with each plan carrying
 *       billing controls for different features.
 *   Side effects:
 *     - Skipped line items are excluded from the Stripe invoice total (and
 *       therefore from the stored Autumn invoice total).
 *
 * Pre-impl red: skip_overage_billing is stripped by zod on plan create /
 * customer update, so overage is billed everywhere → latestTotal mismatches.
 * Post-impl green: schema field + hierarchy resolution + line-item filter in
 * processConsumablePricesForInvoiceCreated.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer-level controls — two overage features, one skips billing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/u) and
 *   consumable words (100 included, $0.05/u)
 * - Customer spend_limits: messages { overage_limit: 500, skip: true },
 *   words { overage_limit: 500, skip: false }
 * - Track messages 150 (50 overage), words 180 (80 overage) → advance cycle
 *
 * Expected:
 * - Renewal invoice = $20 base + $4 words overage (80 × $0.05); the $5
 *   messages overage (50 × $0.10) is NOT billed
 * - BOTH balances reset to 100
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created skip-overage-billing 1: customer-level — one feature skips, one bills, both reset")}`,
	async () => {
		const customerId = "inv-skip-ovg-customer-level";

		const pro = products.pro({
			id: "pro",
			items: [
				items.consumableMessages({ includedUsage: 100 }),
				items.consumableWords({ includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_1, testClockId, advancedTo, ctx } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.attach({ productId: pro.id, timeout: 2000 })],
			});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 500,
						skip_overage_billing: true,
					},
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 500,
						skip_overage_billing: false,
					},
				],
			},
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 180,
		});
		await timeout(4000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: only words overage billed (messages skipped) ──────────
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20 + 80 * 0.05, // $24 — no $5 messages overage
			latestInvoiceProductId: pro.id,
		});

		// ── Contract: BOTH features reset on the cycle ───────────────────────
		expect(customer.features[TestFeature.Messages].balance).toBe(100);
		expect(customer.features[TestFeature.Words].balance).toBe(100);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Plan-level default (percent cap + skip) → customer override re-bills
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/u); plan
 *   billing_controls: { usage_percentage, overage_limit: 20, skip: true }
 *   → usable up to 120% of included allowance, overage never posted to Stripe
 * - Track to the 120 cap; a further track is rejected (cap enforced)
 * - Advance cycle → renewal is base-only, balance resets
 * - Customer override: { usage_percentage, overage_limit: 400, skip: false }
 * - Track 150 (50 overage) → advance cycle → overage IS billed
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created skip-overage-billing 2: plan-level default, customer override re-enables billing")}`,
	async () => {
		const customerId = "inv-skip-ovg-plan-override";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 100 })],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit_type: "usage_percentage",
						overage_limit: 20,
						skip_overage_billing: true,
					},
				],
			},
		});

		const { autumnV1, autumnV2_1, testClockId, advancedTo, ctx } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.attach({ productId: pro.id, timeout: 2000 })],
			});

		// ── Contract: plan-level cap enforced at 120% of included ────────────
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});
		await timeout(4000);

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		const renewedAt = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		const customerAfterFirstCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: plan-level skip → renewal is base-only ─────────────────
		await expectCustomerInvoiceCorrect({
			customer: customerAfterFirstCycle,
			count: 2,
			latestTotal: 20, // 20 units of overage NOT billed
			latestInvoiceProductId: pro.id,
		});

		// ── Contract: balance still resets for the skipped feature ───────────
		expect(customerAfterFirstCycle.features[TestFeature.Messages].balance).toBe(
			100,
		);

		// ── Contract: customer-level entry overrides the plan default ────────
		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit_type: "usage_percentage",
						overage_limit: 400,
						skip_overage_billing: false,
					},
				],
			},
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});
		await timeout(4000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: renewedAt,
			withPause: true,
		});

		const customerAfterSecondCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: overage now posted to Stripe ───────────────────────────
		await expectCustomerInvoiceCorrect({
			customer: customerAfterSecondCycle,
			count: 3,
			latestTotal: 20 + 50 * 0.1, // $25 — 50 overage × $0.10
			latestInvoiceProductId: pro.id,
		});

		expect(
			customerAfterSecondCycle.features[TestFeature.Messages].balance,
		).toBe(100);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Main plan + add-on — included on main, overage price on add-on,
//         different billing controls per plan for different features
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Main pro ($20/mo): words INCLUDED allowance (100, no price) + consumable
 *   messages (100 included, $0.10/u); plan controls: messages { skip: false }
 * - Recurring add-on ($20/mo): consumable words price ($0.05/u, 0 included);
 *   plan controls: words { skip: true }
 * - Track words 150 (50 overage, priced by the add-on), messages 130 (30 overage)
 * - Advance cycle → words overage skipped, messages overage billed, both reset
 * - Customer override: words { skip: false } → track words 140 → advance →
 *   words overage billed
 */
test.concurrent(
	`${chalk.yellowBright("invoice.created skip-overage-billing 3: main plan + add-on with split allowance/price and per-plan controls")}`,
	async () => {
		const customerId = "inv-skip-ovg-addon-split";

		const mainPlan = products.pro({
			id: "main-pro",
			items: [
				items.monthlyWords({ includedUsage: 100 }),
				items.consumableMessages({ includedUsage: 100 }),
			],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: false,
					},
				],
			},
		});

		const wordsAddOn = products.recurringAddOn({
			id: "words-addon",
			items: [items.consumableWords({ includedUsage: 0 })],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: true,
					},
				],
			},
		});

		const { autumnV1, autumnV2_1, testClockId, advancedTo, ctx } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [mainPlan, wordsAddOn] }),
				],
				actions: [
					s.attach({ productId: mainPlan.id, timeout: 2000 }),
					s.attach({ productId: wordsAddOn.id, timeout: 2000 }),
				],
			});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 150,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 130,
		});
		await timeout(4000);

		const renewedAt = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		const customerAfterFirstCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: words overage (add-on control, skip) NOT billed;
		//    messages overage (main-plan control) billed ──────────────────────
		await expectCustomerInvoiceCorrect({
			customer: customerAfterFirstCycle,
			count: 3, // main attach + add-on attach + renewal
			latestTotal: 20 + 20 + 30 * 0.1, // $43 — no words overage ($2.50)
		});

		// ── Contract: both features reset ────────────────────────────────────
		expect(customerAfterFirstCycle.features[TestFeature.Words].balance).toBe(
			100,
		);
		expect(customerAfterFirstCycle.features[TestFeature.Messages].balance).toBe(
			100,
		);

		// ── Contract: customer-level entry overrides the add-on's plan control ─
		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				spend_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 1000,
						skip_overage_billing: false,
					},
				],
			},
		});
		await timeout(3000);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 140,
		});
		await timeout(4000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: renewedAt,
			withPause: true,
		});

		const customerAfterSecondCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: words overage now billed ───────────────────────────────
		await expectCustomerInvoiceCorrect({
			customer: customerAfterSecondCycle,
			count: 4,
			latestTotal: 20 + 20 + 40 * 0.05, // $42 — 40 words overage × $0.05
		});

		expect(customerAfterSecondCycle.features[TestFeature.Words].balance).toBe(
			100,
		);
	},
);
