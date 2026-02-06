import { test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Discount Product Scenario
 *
 * Tests upgrading from one product to another with a discount applied.
 * Customer attaches starter plan, then a 20% discount is applied.
 * Upgrades to pro plan to verify the discount is reflected in pricing.
 */

test(`${chalk.yellowBright("checkout: discount applied to upgrade - 20% off")}`, async () => {
	const customerId = "checkout-discount-product";

	// Starter plan ($19/mo) - basic features
	const starter = products.base({
		id: "starter",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	// Pro plan ($49/mo) - more features
	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	// Setup: customer with payment method and starter plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: "starter" })],
	});

	// Get Stripe subscription and apply discount
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Create 20% discount coupon and apply to subscription
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Get customer state before upgrade
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before upgrade with discount:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview upgrade to pro (should show discounted charge)
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade with 20% discount preview:", upgradePreview);

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade with 20% discount result:", upgradeResult);
});
