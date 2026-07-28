/**
 * Invoice-Matched Proration Credits — Cancel Tests
 *
 * Verifies that cancellation credits and refunds source amounts from stored
 * invoice line items rather than catalog prices.
 *
 * - cancel_immediately with discount: credit reflects discounted charge ($16)
 * - cancel_end_of_cycle: no immediate credit line items
 * - refund_last_payment prorated with discount: refund based on discounted invoice
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
import { createPercentCoupon } from "../utils/discounts/discountTestUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel immediately prorated with discount — credit from stored charge
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits cancel 1: cancel immediately with discount — credit reflects stored charge")}`,
	async () => {
		const customerId = "imc-cancel-imm-disc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
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
			product_id: pro.id,
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

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		expect(preview.total).toBeLessThan(0);
		// Stored $16 renewal charge, with 4d invoice finalization + 15d elapsed.
		expect(preview.total).toBeGreaterThan(-6.5);
		expect(preview.total).toBeLessThanOrEqual(-5);

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
// TEST 2: Cancel end_of_cycle — no immediate credit lines
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits cancel 2: cancel end_of_cycle — no immediate credit line items")}`,
	async () => {
		const customerId = "imc-cancel-eoc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const customerBeforeCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerBeforeCancel,
			productId: pro.id,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle" as const,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		expect(preview.total).toBe(0);

		const creditLines = preview.line_items.filter((li: { total: number }) => li.total < 0);
		expect(creditLines.length).toBe(0);

		await autumnV1.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1,
			latestTotal: 20,
		});
	},
	300_000,
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel discounted plan refund_last_payment prorated — refund based on discounted invoice
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits cancel 3: cancel with refund_last_payment prorated — refund reflects discounted invoice")}`,
	async () => {
		const customerId = "imc-cancel-refund-disc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
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
			product_id: pro.id,
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
			refund_last_payment: "prorated" as const,
		};

		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		expect(preview.total).toBe(0);
		expect(preview.refund).toBeDefined();

		const refundAmount = preview.refund!.amount;
		expect(refundAmount).toBeGreaterThan(0);
		expect(refundAmount).toBeLessThanOrEqual(16);
		// Stored $16 renewal charge, with 4d invoice finalization + 15d elapsed.
		expect(refundAmount).toBeGreaterThanOrEqual(5);

		expect(preview.refund!.invoice.total).toBe(16);

		await autumnV1.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 2,
		});
	},
	300_000,
);
