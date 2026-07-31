import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(
	chalk.yellowBright(
		"multi-attach discounts: applies global and scoped coupons",
	),
	async () => {
		const planA = products.pro({
			id: "discount-plan-a",
			items: [items.monthlyMessages()],
		});
		const planB = products.base({
			id: "discount-plan-b",
			group: "discount-group-b",
			items: [items.monthlyWords(), items.monthlyPrice({ price: 30 })],
		});
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "ma-discounts",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [planA, planB] }),
			],
			actions: [],
		});
		const fullPlanB = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planB.id,
		});
		const [globalCoupon, scopedCoupon] = await Promise.all([
			createPercentCoupon({ stripeCli: ctx.stripeCli, percentOff: 20 }),
			createAmountCoupon({
				stripeCli: ctx.stripeCli,
				amountOffCents: 1000,
				appliesToProducts: [fullPlanB.processor!.id],
			}),
		]);
		const params = {
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
			discounts: [
				{ reward_id: globalCoupon.id },
				{ reward_id: scopedCoupon.id },
			],
		};

		const preview = await autumnV2_2.billing.previewMultiAttach(params);
		expect(preview.total).toBe(30);

		await autumnV2_2.billing.multiAttach(params);
		const customer = await autumnV2_2.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({ customer, active: [planA.id, planB.id] });
		await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 30 });
		const { subscription } = await getStripeSubscription({
			customerId,
			expand: ["data.discounts.source.coupon"],
		});
		const couponIds = subscription.discounts?.map((discount) => {
			if (typeof discount === "string") return discount;
			const coupon = discount.source?.coupon;
			return typeof coupon === "string" ? coupon : coupon?.id;
		});
		expect(couponIds).toEqual(
			expect.arrayContaining([globalCoupon.id, scopedCoupon.id]),
		);
	},
);
