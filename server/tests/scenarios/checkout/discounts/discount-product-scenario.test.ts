import { test } from "bun:test";
import type { AttachParamsV1 } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("checkout: discount applied to upgrade - 20% off")}`, async () => {
	const customerId = "checkout-discount-product";

	const starter = products.base({
		id: "starter",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: "starter" })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	const upgradePreview = await autumnV2_1.billing.previewAttach<AttachParamsV1>(
		{
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "always",
		},
	);
	console.log("upgrade with 20% discount preview:", upgradePreview);

	const upgradeResult = await autumnV2_1.billing.attach<AttachParamsV1>({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade with 20% discount result:", upgradeResult);
});
