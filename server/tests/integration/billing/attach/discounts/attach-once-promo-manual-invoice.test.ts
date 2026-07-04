import {
	type AttachParamsV1Input,
	type AttachPreviewResponse,
	atmnToStripeAmount,
} from "@autumn/shared";
import {
	createPercentCoupon,
	createPromotionCode,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { expect, test } from "bun:test";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach once promo: manual upgrade invoice total matches preview")}`, async () => {
	const customerId = "attach-once-promo-manual-invoice";
	const monthly = products.pro({
		id: "monthly-once-promo",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const annual = products.proAnnual({
		id: "annual-once-promo",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [monthly, annual] }),
		],
		actions: [
			s.billing.attach({ productId: monthly.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 25,
		duration: "once",
	});
	const promoCode = await createPromotionCode({
		stripeCli: ctx.stripeCli,
		coupon,
		code: "ONCEPROMO",
	});
	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: annual.id,
		redirect_mode: "if_required",
		discounts: [{ promotion_code: promoCode.code }],
	};

	const preview =
		(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			params,
		)) as AttachPreviewResponse;
	expect(preview.total).toBeLessThan(preview.subtotal);
	expect(preview.line_items.some((item) => item.discounts.length > 0)).toBe(
		true,
	);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	expect(result.invoice?.stripe_id).toBeDefined();
	expect(result.invoice?.total).toBeCloseTo(preview.total, 2);

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);
});
