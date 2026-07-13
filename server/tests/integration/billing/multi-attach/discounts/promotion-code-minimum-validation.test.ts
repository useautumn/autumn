/**
 * Regression for multi-attach transitions with minimum-amount promo codes.
 *
 * Red-failure mode: multi-attach accepts the promo, invoices the customer, then
 * Stripe rejects the subscription update.
 *
 * Green-success criteria: preview and multi-attach reject before any new invoice
 * or plan transition side effect.
 */

import {
	type ApiCustomerV3,
	type MultiAttachParamsV0Input,
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

test.concurrent(
	`${chalk.yellowBright("multi-attach discounts: rejects minimum-amount promo before invoicing")}`,
	async () => {
		const customerId = `multi-attach-min-promo-${Date.now()}`;
		const monthly = products.pro({
			id: "ma-monthly-min-promo",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const annual = products.proAnnual({
			id: "ma-annual-min-promo",
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
			code: `MAMINPROMO${Date.now()}`,
			restrictions: { minimum_amount: 1000, minimum_amount_currency: "usd" },
		});
		const params: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: annual.id }],
			redirect_mode: "if_required",
			discounts: [{ promotion_code: promoCode.code }],
		};

		await expect(autumnV1.billing.previewMultiAttach(params)).rejects.toThrow(
			/promotion code.*minimum/i,
		);
		await expect(autumnV1.billing.multiAttach(params)).rejects.toThrow(
			/promotion code.*minimum/i,
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 1 });
		await expectProductActive({ customer, productId: monthly.id });
		await expectProductNotPresent({ customer, productId: annual.id });
	},
);
