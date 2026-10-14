/**
 * add_lines on attach: add lines to the upgrade invoice Autumn builds.
 *
 * Contract:
 *   - Added lines bill their amount as passed, next to the generated lines.
 *   - period_start / period_end are printed on the Stripe line and never prorate the amount.
 *   - Discounts on the request apply to added lines, as they do to custom_line_items.
 *   - Edited lines that net to $0 create no invoice.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	BillingPreviewResponse,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectPreviewLinesCorrect,
	expectStripeInvoiceLinesCorrect,
} from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const setupProUpgrade = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	return { ...scenario, pro, premium };
};

test.concurrent(
	`${chalk.yellowBright("attach add_lines 1: an added line bills as passed and prints its period")}`,
	async () => {
		const customerId = "attach-add-lines-period";
		const { autumnV2_5, ctx, pro, premium, advancedTo } = await setupProUpgrade(
			{ customerId },
		);

		const periodStartMs = advancedTo;
		const periodEndMs = advancedTo + 10 * DAY_MS;
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			add_lines: [
				{
					amount: 30,
					description: "Priority support",
					period_start: periodStartMs,
					period_end: periodEndMs,
				},
			],
		};

		// Generated: premium $50, pro credit -$20. Added: $30, not prorated by its period.
		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewLinesCorrect({
			preview,
			total: 60,
			lines: [
				{ planId: premium.id, total: 50 },
				{ planId: pro.id, total: -20 },
				{ description: "Priority support", total: 30 },
			],
		});
		const addedPreviewLine = preview.line_items.find(
			(line) => line.description === "Priority support",
		);
		expect(addedPreviewLine?.period).toEqual({
			start: periodStartMs,
			end: periodEndMs,
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: 60,
			lineCount: 3,
			periods: [
				{
					description: "Priority support",
					startMs: periodStartMs,
					endMs: periodEndMs,
				},
			],
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice.stripe_id,
			expectedCount: 3,
			expectedTotal: 60,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach add_lines 2: request discounts apply to added lines")}`,
	async () => {
		const customerId = "attach-add-lines-discount";
		const { autumnV2_5, ctx, premium } = await setupProUpgrade({ customerId });
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			discounts: [{ reward_id: coupon.id }],
			add_lines: [{ amount: 100, description: "Onboarding" }],
		};

		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		// Added lines carry no plan; the description may gain a discount suffix.
		const addedLine = preview.line_items.find((line) => line.plan_id === "");
		expect(addedLine?.subtotal).toBe(100);
		expect(addedLine?.total).toBe(50);

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		const invoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice.stripe_id,
			{ expand: ["lines.data"] },
		);
		expect(invoice.total).toBe(Math.round(preview.total * 100));
		const onboarding = invoice.lines.data.find((line) =>
			line.description?.startsWith("Onboarding"),
		);
		expect(onboarding?.amount).toBe(5000);
	},
);

test.concurrent(
	`${chalk.yellowBright("attach add_lines 3: edits that net to zero create no invoice")}`,
	async () => {
		const customerId = "attach-add-lines-zero";
		const { autumnV2_5, ctx, pro, premium } = await setupProUpgrade({
			customerId,
		});

		// Keep only pro's -$20 credit, then add $20 back.
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			remove_lines: [{ plan_id: premium.id }],
			add_lines: [{ amount: 20, description: "Plan change fee" }],
		};

		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewLinesCorrect({
			preview,
			total: 0,
			lines: [
				{ planId: pro.id, total: -20 },
				{ description: "Plan change fee", total: 20 },
			],
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		expect(result.invoice).toBeUndefined();
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });

		// Nothing left pending for the next invoice either.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		if (!stripeCustomerId) throw new Error("Missing Stripe customer ID");
		const pending = await ctx.stripeCli.invoiceItems.list({
			customer: stripeCustomerId,
			pending: true,
			limit: 100,
		});
		expect(pending.data).toHaveLength(0);
	},
);
