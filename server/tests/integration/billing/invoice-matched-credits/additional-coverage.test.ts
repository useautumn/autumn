/**
 * Invoice-Matched Proration Credits — Additional Coverage
 *
 * 1. amount-off coupon cancel: refund based on discounted invoice
 * 2. cancel after partial refund (upgrade then cancel): second refund nets the first
 * 3. create-schedule with discount: immediate phase credit from stored charge
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachPreviewResponse } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createAmountCoupon } from "../utils/discounts/discountTestUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Amount-off coupon cancel — refund based on discounted invoice ($15)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits additional 1: amount-off coupon cancel — refund based on discounted invoice")}`,
	async () => {
		const customerId = "imc-add-amtoff-cancel";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 15,
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
			latestTotal: 15,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewedAt),
			numberOfDays: 15,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		expect(preview.total).toBeLessThan(0);
		expect(Math.abs(preview.total)).toBeLessThan(10);
		// Stored $15 renewal charge, with 4d invoice finalization + 15d elapsed.
		expect(Math.abs(preview.total)).toBeGreaterThan(4.5);

		await autumnV1.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 3,
			latestTotal: preview.total,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel after partial refund (upgrade then cancel) — second refund nets the first
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits additional 2: cancel after upgrade — second refund nets the first")}`,
	async () => {
		const customerId = "imc-add-upg-then-cancel";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.advanceTestClock({ toNextInvoice: true }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const upgradeResult = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(upgradeResult.invoice).toBeDefined();

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterUpgrade,
			productId: `premium_${customerId}`,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: `premium_${customerId}`,
			cancel_action: "cancel_immediately" as const,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		expect(preview.total).toBeLessThan(0);

		await autumnV1.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: `premium_${customerId}`,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Scheduled upgrade with discount — immediate phase credit from stored charge
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits additional 3: scheduled upgrade with discount — credit reflects discounted charge")}`,
	async () => {
		const customerId = "imc-add-sched-disc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 400,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 16,
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
			latestTotal: 16,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewedAt),
			numberOfDays: 15,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-16);

		for (const creditLine of creditLines) {
			const discounts = creditLine.discounts ?? [];
			// Stored coupon is metadata; it is not applied again to the net credit.
			expect(discounts.length).toBe(1);
		}

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);
