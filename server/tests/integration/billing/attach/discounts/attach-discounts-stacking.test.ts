/**
 * Integration tests for discount stacking when attaching with existing subscription discounts.
 *
 * Tests how param discounts interact with pre-existing Stripe subscription discounts:
 * - Param discounts merge with existing subscription discounts
 * - Duplicate coupons are deduplicated
 * - Percent + amount stacking order is preserved
 * - Multiple param discounts + existing discounts all stack correctly
 * - New subscription with discount (no existing discounts)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Param discount stacks with existing sub discount
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro ($20/mo) with 10% coupon already on subscription
 * - Upgrade to premium ($50/mo) with 20% param discount
 *
 * Expected:
 * - Both discounts applied to charge
 * - Charge: $50, 10% off = $45, 20% off = $36
 * - Refund: -$20
 * - Total: -$20 + $36 = $16
 */
test.concurrent(`${chalk.yellowBright("attach-discount-stacking 1: param discount stacks with existing sub discount")}`, async () => {
	const customerId = "att-disc-stack-exist";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Apply 10% discount to existing subscription
	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	// Create param discount: 20% off
	const paramCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	// Preview upgrade with param discount
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	// Refund -$20 + charge $50 * 0.9 * 0.8 = $36 => total $16
	expect(preview.total).toBe(16);

	// Execute
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Duplicate coupon deduped with existing sub discount
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro ($20/mo) with 20% coupon on subscription
 * - Upgrade to premium ($50/mo) with same coupon as param discount
 *
 * Expected:
 * - Deduped: only one instance of the coupon
 * - Charge: $50 * 0.8 = $40
 * - Refund: -$20
 * - Total: -$20 + $40 = $20
 */
test.concurrent(`${chalk.yellowBright("attach-discount-stacking 2: duplicate coupon deduped with existing")}`, async () => {
	const customerId = "att-disc-stack-dedup";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Apply 20% coupon to existing subscription
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Pass the same coupon as param discount
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	// Only one 20% discount (deduped): $50 * 0.8 = $40, refund -$20, total $20
	expect(preview.total).toBe(20);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Param amount + existing percent stack correctly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro ($20/mo) with 30% coupon on subscription
 * - Upgrade to premium ($50/mo) with $5 off param discount
 *
 * Expected:
 * - Percent applied first: $50 * 0.7 = $35
 * - Then amount: $35 - $5 = $30
 * - Refund: -$20
 * - Total: -$20 + $30 = $10
 */
test.concurrent(`${chalk.yellowBright("attach-discount-stacking 3: param amount + existing percent")}`, async () => {
	const customerId = "att-disc-stack-mixed";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Existing: 30% off
	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 30,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	// Param: $5 off
	const paramCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 500,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: paramCoupon.id }],
	});

	// Charge $50 * 0.7 = $35, then $5 off = $30, refund -$20, total $10
	expect(preview.total).toBe(10);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple param discounts + existing discount
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro ($20/mo) with 10% coupon on subscription
 * - Upgrade to premium ($50/mo) with two param discounts: 20% + $3 off
 *
 * Expected:
 * - Three discounts total: 10%, 20%, $3 off
 * - Charge: $50 * 0.9 * 0.8 = $36, then $3 off = $33
 * - Refund: -$20
 * - Total: -$20 + $33 = $13
 */
test.concurrent(`${chalk.yellowBright("attach-discount-stacking 4: multiple param discounts + existing")}`, async () => {
	const customerId = "att-disc-stack-multi";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Existing: 10% off
	const existingCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [existingCoupon.id],
	});

	// Param: 20% off + $3 off
	const pctCoupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
	const amtCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 300,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: pctCoupon.id }, { reward_id: amtCoupon.id }],
	});

	// Charge $50 * 0.9 * 0.8 = $36, $36 - $3 = $33, refund -$20, total $13
	expect(preview.total).toBe(13);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Discount on fresh subscription (no existing discounts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product (no Stripe subscription)
 * - Attach pro ($20/mo) with 50% param discount
 *
 * Expected:
 * - New subscription created with discount
 * - Invoice = $20 * 0.5 = $10
 */
test.concurrent(`${chalk.yellowBright("attach-discount-stacking 5: discount on fresh subscription")}`, async () => {
	const customerId = "att-disc-stack-fresh";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });

	// Preview
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});
	expect(preview.total).toBe(10);

	// Execute
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});
});
