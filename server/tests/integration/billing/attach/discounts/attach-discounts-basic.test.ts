/**
 * Integration tests for attaching products with discounts param.
 *
 * Tests basic discount scenarios:
 * - Percent-off and amount-off rewards on new subscriptions
 * - Promotion code resolution
 * - Multiple rewards stacking
 * - Duplicate reward deduplication
 * - Upgrade with discount
 * - Preview accuracy with discounts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createAmountCoupon,
	createPercentCoupon,
	createPromotionCode,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Pro with percent-off reward
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create 20% off coupon in Stripe
 * - Attach pro ($20/mo) with discount param
 *
 * Expected:
 * - Pro active, free removed
 * - Invoice = $20 * 0.8 = $16
 */
test.concurrent(`${chalk.yellowBright("attach-discount 1: free to pro with percent-off reward")}`, async () => {
	const customerId = "att-disc-pct-off";

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
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

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

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 16,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free to Pro with amount-off reward
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create $5 off coupon in Stripe
 * - Attach pro ($20/mo) with discount param
 *
 * Expected:
 * - Pro active, free removed
 * - Invoice = $20 - $5 = $15
 */
test.concurrent(`${chalk.yellowBright("attach-discount 2: free to pro with amount-off reward")}`, async () => {
	const customerId = "att-disc-amt-off";

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
	const coupon = await createAmountCoupon({ stripeCli, amountOffCents: 500 });

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

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Free to Pro with promotion code
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create 25% coupon + promotion code in Stripe
 * - Attach pro ($20/mo) with promotion_code param
 *
 * Expected:
 * - Pro active
 * - Invoice = $20 * 0.75 = $15
 */
test.concurrent(`${chalk.yellowBright("attach-discount 3: free to pro with promotion code")}`, async () => {
	const customerId = "att-disc-promo";

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
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });
	const promoCode = await createPromotionCode({
		stripeCli,
		coupon,
		code: `SAVE25-${customerId}`,
	});

	// Use the human-readable code string (not the promo code ID)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ promotion_code: promoCode.code }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple rewards stack on new subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create 20% off + $2 off coupons
 * - Attach pro ($20/mo) with both discounts
 *
 * Expected:
 * - Percent applied first: $20 * 0.8 = $16
 * - Then amount: $16 - $2 = $14
 * - Invoice = $14
 */
test.concurrent(`${chalk.yellowBright("attach-discount 4: multiple rewards stack on new subscription")}`, async () => {
	const customerId = "att-disc-multi";

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
	const pctCoupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
	const amtCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 200,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: pctCoupon.id }, { reward_id: amtCoupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// 20% off $20 = $16, then $2 off = $14
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 14,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Duplicate reward deduped
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create 20% off coupon
 * - Attach pro with same coupon passed twice in discounts array
 *
 * Expected:
 * - Only one discount applied (deduped by coupon ID)
 * - Invoice = $20 * 0.8 = $16 (not $20 * 0.8 * 0.8)
 */
test.concurrent(`${chalk.yellowBright("attach-discount 5: duplicate reward deduped")}`, async () => {
	const customerId = "att-disc-dedup";

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
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }, { reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Only one 20% discount, not double
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 16,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Upgrade pro to premium with reward
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on pro ($20/mo)
 * - Create 20% off coupon
 * - Upgrade to premium ($50/mo) with discount
 *
 * Expected:
 * - At start of cycle: refund -$20 (full pro), charge $50 (full premium)
 * - Discount applies to charge: $50 * 0.8 = $40
 * - Total: -$20 + $40 = $20
 */
test.concurrent(`${chalk.yellowBright("attach-discount 6: upgrade pro to premium with reward")}`, async () => {
	const customerId = "att-disc-upgrade";

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

	const { stripeCli } = await getStripeSubscription({ customerId });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	// Preview should include discount
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	// Refund -$20 + discounted charge ($50 * 0.8 = $40) = $20
	expect(preview.total).toBe(20);

	// Execute attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Invoices: pro ($20) + upgrade ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Preview includes discount and matches execution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product
 * - Create 25% off coupon
 * - Preview attach pro ($20/mo) with discount
 * - Execute attach with same discount
 *
 * Expected:
 * - Preview total = $20 * 0.75 = $15
 * - Invoice total matches preview
 */
test.concurrent(`${chalk.yellowBright("attach-discount 7: preview matches execution with discount")}`, async () => {
	const customerId = "att-disc-preview";

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
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 25 });

	// Preview
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});
	expect(preview.total).toBe(15);

	// Execute
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Invoice total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
