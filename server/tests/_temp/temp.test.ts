import { test } from "bun:test";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 2-month repeating 20% off coupon
 * - Delete the coupon from Stripe (coupon.deleted = true)
 * - Advance 2 weeks (mid-cycle)
 * - Upgrade to premium ($50/mo) — immediate switch
 *
 * Expected:
 * - Upgrade succeeds (no error even though coupon is deleted)
 * - Discount ID unchanged (same di_xxx — carried over via { discount: id })
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 3: upgrade carries over discount when coupon is deleted")}`, async () => {
	const customerId = "temp";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
		discounts: [
			{
				reward_id: coupon.id,
			},
		],
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});
});
