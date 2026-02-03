import { test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Discount Product Scenario
 *
 * Tests attaching a product with a discount applied.
 * Customer attaches pro plan with prepaid messages, then a 20% discount is applied.
 * Previews an upgrade to verify the discount is reflected in pricing.
 */

test(`${chalk.yellowBright("checkout: discount applied to product - 20% off")}`, async () => {
	const customerId = "checkout-discount-product";

	// Pro plan ($20/mo) - standard features with prepaid messages
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10, // $10 per 100 messages
			}),
		],
	});

	// Setup: customer with payment method and pro plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach pro plan with 500 messages ($50 for messages + $20 base = $70)
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
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

	// 1. Preview upgrade to more messages (should show discounted charge)
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: [{ feature_id: TestFeature.Messages, quantity: 1000 }],
		redirect_mode: "always",
	});
	console.log("upgrade with 20% discount preview:", upgradePreview);

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: [{ feature_id: TestFeature.Messages, quantity: 1000 }],
		redirect_mode: "always",
	});
	console.log("upgrade with 20% discount result:", upgradeResult);
});
