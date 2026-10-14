import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { stripeRefToId } from "@autumn/shared";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright(
		"update-subscription-discounts: update applies discount to Stripe sub AND next-cycle invoice",
	)}`,
	async () => {
		const customerId = "tdd-update-sub-discounts";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		if (!testClockId) {
			throw new Error("testClockId not set — expected testClock: true");
		}

		const initialCustomer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
			latestTotal: 20,
		});

		const { stripeCli, subscription: subBefore } = await getStripeSubscription({
			customerId,
			expand: ["data.discounts.source.coupon"],
		});
		expect(subBefore.discounts?.length ?? 0).toBe(0);

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
			duration: "forever",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		});

		const subAfter = await stripeCli.subscriptions.retrieve(subBefore.id, {
			expand: ["discounts.source.coupon"],
		});
		expect(subAfter.discounts?.length ?? 0).toBeGreaterThanOrEqual(1);

		const couponIdsOnSub = (subAfter.discounts ?? [])
			.map((d) => {
				if (typeof d === "string") return null;
				const c = d.source?.coupon;
				if (!c) return null;
				return stripeRefToId(c);
			})
			.filter((id): id is string => id !== null);
		expect(couponIdsOnSub).toContain(coupon.id);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfMonths: 1,
			numberOfHours: 2,
			waitForSeconds: 30,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 10,
		});
	},
);
