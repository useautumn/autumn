import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	createPercentCoupon,
	createPromotionCode,
} from "../../utils/discounts/discountTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("attach discount: rejects promo restricted to another product")}`,
	async () => {
		const customerId = "promo-applies-to-other-product";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const otherProduct = await ctx.stripeCli.products.create({
			name: customerId,
		});
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			appliesToProducts: [otherProduct.id],
		});
		const promotionCode = await createPromotionCode({
			stripeCli: ctx.stripeCli,
			coupon,
			code: "OTHER_PRODUCT",
		});
		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [{ promotion_code: promotionCode.code }],
		};

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "does not apply to any products in this order",
			func: () => autumnV2_2.billing.previewAttach<AttachParamsV1Input>(params),
		});
	},
);
