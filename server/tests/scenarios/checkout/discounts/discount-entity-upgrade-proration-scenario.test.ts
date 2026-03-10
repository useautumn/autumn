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
 * Discount Entity Upgrade Proration Scenario
 *
 * Tests upgrading an entity's plan mid-cycle with a discount applied.
 * Customer has pro on both entities, advances 15 days (mid-cycle),
 * then upgrades entity-2 to premium with 25% discount.
 * This tests the interaction between proration, discounts, and entity-level billing.
 */

test(`${chalk.yellowBright("checkout: entity upgrade with discount and proration")}`, async () => {
	const customerId = "checkout-discount-entity-proration";

	// Pro plan ($20/mo) - standard features
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({
				includedUsage: 200,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	// Premium plan ($50/mo) - more features
	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
			items.prepaidUsers({ includedUsage: 5, billingUnits: 1 }),
		],
	});

	// Setup: customer with test clock, payment method, and 2 entities with pro attached
	// Then advance 15 days (halfway through billing cycle)
	const { autumnV1, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro plan to both entities
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "pro", entityIndex: 1 }),
			// Advance 15 days - halfway through the billing cycle
			s.advanceTestClock({ days: 15 }),
		],
	});

	console.log("advanced to:", new Date(advancedTo).toISOString());

	// Get Stripe subscription and apply 25% discount
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 25,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Get customer state before upgrade
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before entity upgrade with discount:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	// Options for prepaid features in premium plan
	const premiumOptions = [{ feature_id: TestFeature.Users, quantity: 10 }];

	// 1. Preview upgrading entity-2 to premium (prorated + discounted)
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id, // ent-2
		options: premiumOptions,
		redirect_mode: "always",
	});
	console.log(
		"entity upgrade preview (prorated + 25% discount):",
		upgradePreview,
	);

	// 2. Upgrade entity-2 to premium with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
		options: premiumOptions,
	});
	console.log(
		"entity upgrade result (prorated + 25% discount):",
		upgradeResult,
	);
});
