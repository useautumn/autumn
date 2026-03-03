/**
 * Integration tests for duplicate discount handling across billing cycles.
 *
 * Tests that when a discount code already applied to a subscription is passed
 * again on a subsequent billing cycle, it is silently ignored (not applied twice)
 * and the attach still succeeds.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "../../utils/discounts/discountTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: billing.attach - duplicate discount on next cycle is silently ignored
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free (no subscription)
 * - Cycle 1: Attach pro WITH a 20% forever coupon → subscription created with coupon
 * - Advance to next invoice (cycle 2)
 * - Cycle 2: Upgrade to premium WITH same coupon → attach succeeds, duplicate ignored
 *
 * Expected:
 * - No error — attach succeeds
 * - premium is active, coupon not double-applied
 */
test.concurrent(`${chalk.yellowBright("attach-discount-double-use 1: billing.attach - duplicate discount on next cycle silently ignored")}`, async () => {
	const customerId = "att-disc-double-use-attach";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	// Cycle 1: Attach pro with discount
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	// Advance to next invoice (start of cycle 2)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(advancedTo), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	// Cycle 2: Upgrade with same discount — should succeed, duplicate silently ignored
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

	// Coupon must appear exactly once — not double-applied
	const { subscription } = await getStripeSubscription({ customerId });
	const couponDiscounts = subscription.discounts.filter((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	expect(couponDiscounts).toHaveLength(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: billing.multiAttach - duplicate discount on next cycle is silently ignored
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free (no subscription)
 * - Cycle 1: multiAttach [pro] WITH a 20% forever coupon → subscription created with coupon
 * - Advance to next invoice (cycle 2)
 * - Cycle 2: multiAttach [addon] WITH same coupon → attach succeeds, duplicate ignored
 *
 * Expected:
 * - No error — attach succeeds
 * - addon is active
 */
test.concurrent(`${chalk.yellowBright("attach-discount-double-use 2: billing.multiAttach - duplicate discount on next cycle silently ignored")}`, async () => {
	const customerId = "att-disc-double-use-multi";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	// Cycle 1: multiAttach pro with discount
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: pro.id }],
		discounts: [{ reward_id: coupon.id }],
	});

	// Advance to next invoice (start of cycle 2)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addHours(
			addMonths(new Date(advancedTo), 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	// Cycle 2: multiAttach addon with same discount — should succeed, duplicate silently ignored
	await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: addon.id }],
		discounts: [{ reward_id: coupon.id }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
		notPresent: [free.id],
	});

	// Coupon must appear exactly once on the pro subscription — not double-applied
	const { subscription } = await getStripeSubscription({ customerId });
	const couponDiscounts = subscription.discounts.filter((d) => {
		if (typeof d === "string") return false;
		const c = d.source?.coupon;
		return typeof c !== "string" && c?.id === coupon.id;
	});
	expect(couponDiscounts).toHaveLength(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: same coupon on a different customer's subscription → allowed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer 1 attaches pro WITH a 20% forever coupon → their subscription gets the coupon
 * - Customer 2 (different subscription) attaches pro with the SAME coupon → should succeed
 *
 * This confirms the check is per-subscription, not a global coupon blacklist.
 * The same coupon ID may be freely used across different customers' subscriptions.
 */
test.concurrent(`${chalk.yellowBright("attach-discount-double-use 3: same coupon on different customer subscription → allowed")}`, async () => {
	const customerId1 = "att-disc-double-use-c1";
	const customerId2 = "att-disc-double-use-c2";

	// Separate product objects per customer — initScenario mutates product.id in-place
	const free1 = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro1 = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const free2 = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro2 = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId: customerId1,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free1, pro1] }),
		],
		actions: [s.billing.attach({ productId: free1.id })],
	});

	await initScenario({
		customerId: customerId2,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free2, pro2] }),
		],
		actions: [s.billing.attach({ productId: free2.id })],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

	// Customer 1: attach pro with coupon → their subscription gets the coupon
	await autumnV1.billing.attach({
		customer_id: customerId1,
		product_id: pro1.id,
		discounts: [{ reward_id: coupon.id }],
	});

	// Customer 2: attach pro with the SAME coupon → different subscription → must succeed
	await autumnV1.billing.attach({
		customer_id: customerId2,
		product_id: pro2.id,
		discounts: [{ reward_id: coupon.id }],
	});

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId2);
	await expectCustomerProducts({
		customer: customer2,
		active: [pro2.id],
		notPresent: [free2.id],
	});
});
