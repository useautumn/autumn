// Per-feature `skip_overage_billing` on spend_limit billing controls: skipped overage is not
// posted on invoice.created renewals, balances still reset, entity > customer > plan precedence.

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
