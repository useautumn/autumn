/**
 * proration_behavior: "bill_difference" on a mid-cycle plan switch.
 *
 * Contract:
 *   Pro ($20) -> Premium ($50) on day 14 charges Premium's full price and credits only
 *   Pro's unused time, grants Premium's full balance, and keeps the renewal date.
 *   When Pro was paid for only part of the cycle, the credit is the unused part of what was paid.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	BillingPreviewResponse,
} from "@autumn/shared";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "@tests/integration/billing/attach/params/anchor-to-month-start/utils/anchorToMonthStartUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import {
	calculateResetBillingCycleNowTotal,
	getBillingPeriod,
} from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewTotalCorrect } from "./utils/expectPreviewTotalCorrect";

test.concurrent(
	`${chalk.yellowBright("bill_difference: pro -> premium charges full premium, credits unused pro")}`,
	async () => {
		const customerId = "bill-diff-plan-switch";

		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			proration_behavior: "bill_difference",
		};

		const preview: BillingPreviewResponse =
			await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewTotalCorrect({ preview, total: expectedTotal });
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: billingPeriod.end,
			total: 50,
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>(params);

		const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({ customer, productId: premium.id });
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: 500,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});

		const { billingPeriod: periodAfter } = await getBillingPeriod({
			customerId,
		});
		expect(periodAfter.end).toEqual(billingPeriod.end);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("bill_difference: credits only the unused part of a partly paid plan")}`,
	async () => {
		const customerId = "bill-diff-partial-paid";

		const pro = anchoredToMonthStart(
			products.pro({ items: [items.monthlyMessages({ includedUsage: 100 })] }),
		);
		const premium = anchoredToMonthStart(
			products.premium({
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
		);

		const { autumnV1, autumnV2_4, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ hours: 12 }),
			],
		});

		const [stubInvoice] =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices ?? [];
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: stubInvoice.total,
			newAmount: 50,
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			proration_behavior: "bill_difference",
		};

		const preview: BillingPreviewResponse =
			await autumnV2_4.billing.previewAttach<AttachParamsV1Input>(params);
		expectPreviewTotalCorrect({ preview, total: expectedTotal });

		await autumnV2_4.billing.attach<AttachParamsV1Input>(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);
