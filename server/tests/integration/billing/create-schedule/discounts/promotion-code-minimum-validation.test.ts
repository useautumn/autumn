/**
 * Regression for create_schedule immediate transitions with minimum-amount promo codes.
 *
 * Red-failure mode: create_schedule accepts the promo, invoices the customer,
 * then Stripe rejects the subscription update.
 *
 * Green-success criteria: preview and create_schedule reject before any new
 * invoice or plan transition side effect.
 */

import {
	type ApiCustomerV3,
	type AttachPreviewResponse,
	type CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { expect, test } from "bun:test";
import chalk from "chalk";

const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

test.concurrent(
	`${chalk.yellowBright("create-schedule discounts: rejects minimum-amount promo before invoicing")}`,
	async () => {
		const customerId = `create-schedule-min-promo-${Date.now()}`;
		const monthly = products.pro({
			id: "cs-monthly-min-promo",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const annual = products.proAnnual({
			id: "cs-annual-min-promo",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [monthly, annual] }),
			],
			actions: [s.billing.attach({ productId: monthly.id })],
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			duration: "once",
		});
		const promoCode = await ctx.stripeCli.promotionCodes.create({
			promotion: { type: "coupon", coupon: coupon.id },
			code: `CSMINPROMO${Date.now()}`,
			restrictions: { minimum_amount: 1000, minimum_amount_currency: "usd" },
		});
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: annual.id }] }],
			redirect_mode: "if_required",
			discounts: [{ promotion_code: promoCode.code }],
		};

		await expect(previewCreateSchedule({ autumnV1, params })).rejects.toThrow(
			/promotion code.*minimum/i,
		);
		await expect(autumnV1.billing.createSchedule(params)).rejects.toThrow(
			/promotion code.*minimum/i,
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 1 });
		await expectProductActive({ customer, productId: monthly.id });
		await expectProductNotPresent({ customer, productId: annual.id });
	},
);
