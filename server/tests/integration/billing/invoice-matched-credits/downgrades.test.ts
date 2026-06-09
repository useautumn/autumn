/**
 * Invoice-Matched Proration Credits — Downgrade Tests
 *
 * Verifies that scheduled downgrade previews source outgoing credits from
 * stored invoice line items (actual charged amounts) rather than catalog prices.
 *
 * - With discount: outgoing credit reflects the discounted charge ($40, not $50)
 * - Without discount: outgoing credit reflects the full catalog charge ($50)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createPercentCoupon } from "../utils/discounts/discountTestUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Scheduled downgrade with discount — outgoing credit reflects discounted price
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits downgrade 1: scheduled downgrade with discount — next_cycle outgoing credit reflects discounted price")}`,
	async () => {
		const customerId = "imc-down-disc";

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [premium, pro] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 40,
		});

		const renewedAt = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 40,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewedAt),
			numberOfDays: 5,
		});

		const preview = await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		});

		expect(preview.total).toBe(0);

		const nextCycle = expectPreviewNextCycleCorrect({
			preview,
			expectDefined: true,
		})!;

		expect(nextCycle.total).toBeLessThan(50);
		expect(nextCycle.total).toBeGreaterThan(0);
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Scheduled downgrade without discount — outgoing credit reflects full price
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits downgrade 2: scheduled downgrade without discount — next_cycle outgoing credit reflects full price")}`,
	async () => {
		const customerId = "imc-down-full";

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.advanceToNextInvoice(),
				s.advanceTestClock({ days: 5 }),
			],
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 50,
		});

		const preview = await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		});

		expect(preview.total).toBe(0);

		const nextCycle = expectPreviewNextCycleCorrect({
			preview,
			expectDefined: true,
		})!;

		expect(nextCycle.total).toBeLessThan(50);
		expect(nextCycle.total).toBeGreaterThan(0);
	},
	300_000,
);
