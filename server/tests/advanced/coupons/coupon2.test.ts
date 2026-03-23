import { expect, test } from "bun:test";
import {
	CouponDurationType,
	type CreateReward,
	LegacyVersion,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 as completeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { createReward } from "@tests/utils/productUtils.js";
import { getDiscount } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const testCase = "coupon2";

const pro = products.pro({
	id: "pro",
	items: [items.consumableWords()],
});

// Reward: InvoiceCredits, $10000, Forever, rollover, NOT apply_to_all (usage-only)
const reward: CreateReward = {
	id: "usage",
	name: "usage",
	promo_codes: [{ code: "usage" }],
	type: RewardType.InvoiceCredits,
	discount_config: {
		discount_value: 10000,
		duration_type: CouponDurationType.Forever,
		duration_value: 1,
		should_rollover: true,
		apply_to_all: false,
		price_ids: [],
	},
};

test(
	chalk.yellow(`${testCase} - Testing one-off rollover, apply to usage only`),
	async () => {
		const customerId = testCase;

		// Init scenario: products + customer (no PM, uses checkout)
		const { testClockId, ctx: testCtx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		// Create autumn client with LegacyVersion.v1_4 (matches original test)
		const autumn = new AutumnInt({
			version: LegacyVersion.v1_4,
			secretKey: testCtx.orgSecretKey,
		});

		// Create reward manually with onlyUsage: true (s.reward doesn't support this)
		await createReward({
			orgId: testCtx.org.id,
			env: testCtx.env,
			db: testCtx.db,
			autumn,
			reward,
			productId: pro.id,
			onlyUsage: true,
		});

		let couponAmount = reward.discount_config?.discount_value ?? 0;

		// CYCLE 0: Attach pro with promo code via checkout
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await completeCheckoutForm({ url: res.checkout_url, promoCode: reward.id });

		await timeout(10000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		// Should have fixed price invoice (coupon only applies to usage, not base price)
		const fixedPrice = getBasePrice({ product: pro });
		expect(customer.invoices![0].total).toBe(fixedPrice);

		const cusDiscount = await getDiscount({
			stripeCli: testCtx.stripeCli,
			stripeId: customer.stripe_id!,
		});

		expect(getOriginalCouponId(cusDiscount?.source.coupon?.id ?? "")).toBe(
			reward.id,
		);

		// CYCLE 1: Track usage and verify correct invoice amount
		// Cap usage so it stays within $10k coupon at $0.05/word (max ~200k words)
		const usage = new Decimal(Math.random() * 100000 + 10000)
			.toDecimalPlaces(2)
			.toNumber();

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: usage,
		});

		const usageTotal = await getExpectedInvoiceTotal({
			org: testCtx.org,
			env: testCtx.env,
			db: testCtx.db,
			customerId,
			productId: pro.id,
			usage: [{ featureId: TestFeature.Words, value: usage }],
			stripeCli: testCtx.stripeCli,
			onlyIncludeUsage: true,
		});

		const basePrice = getBasePrice({ product: pro });

		couponAmount = couponAmount - usageTotal;

		await advanceTestClock({
			stripeCli: testCtx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 20,
		});

		const customerAfterCycle = await autumn.customers.get(customerId);
		expect(customerAfterCycle.invoices![0].total).toBe(basePrice);

		const cusDiscountAfterCycle = await getDiscount({
			stripeCli: testCtx.stripeCli,
			stripeId: customerAfterCycle.stripe_id!,
		});

		expect(
			getOriginalCouponId(cusDiscountAfterCycle?.source.coupon?.id ?? ""),
		).toBe(reward.id);
	},
);
