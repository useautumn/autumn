// Per-feature `skip_overage_billing` on spend_limit billing controls: skipped overage is not
// posted on invoice.created renewals, balances still reset, entity > customer > plan precedence.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
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
