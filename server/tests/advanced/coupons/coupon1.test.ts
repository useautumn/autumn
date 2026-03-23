import { expect, test } from "bun:test";
import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	LegacyVersion,
	type Organization,
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
import { advanceTestClock, getDiscount } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";

const testCase = "coupon1";

const pro = products.pro({
	id: "pro",
	items: [items.consumableWords()],
});

// Reward: InvoiceCredits, $1000, Forever duration, rollover=true, apply_to_all=true
const rewardId = `${testCase}rolloverAll`;
const promoCode = `${testCase}rolloverAllCode`;
const reward: CreateReward = {
	id: rewardId,
	name: "Rollover All",
	type: RewardType.InvoiceCredits,
	promo_codes: [{ code: promoCode }],
	discount_config: {
		discount_value: 1000,
		duration_type: CouponDurationType.Forever,
		duration_value: 0,
		should_rollover: true,
		apply_to_all: true,
		price_ids: [],
	},
};

const simulateOneCycle = async ({
	customerId,
	stripeCli,
	autumn,
	testClockId,
	couponAmount,
	curUnix,
	ctx,
}: {
	customerId: string;
	stripeCli: import("stripe").Stripe;
	autumn: AutumnInt;
	testClockId: string;
	couponAmount: number;
	curUnix: number;
	ctx: { db: DrizzleCli; org: Organization; env: AppEnv };
}) => {
	// Cap usage so invoice stays within coupon amount across 2 cycles
	// At $0.05/word + $20 base, keep usage under 5000 words (~$250 usage + $20 base = ~$270/cycle)
	const usage = Math.random() * 4000 + 1000;
	await autumn.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: usage,
	});

	// Expected invoice total
	const expectedTotal = await getExpectedInvoiceTotal({
		usage: [{ featureId: TestFeature.Words, value: usage }],
		customerId,
		productId: pro.id,
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		stripeCli,
	});

	couponAmount -= expectedTotal;

	curUnix = await advanceTestClock({
		stripeCli,
		testClockId,
		advanceTo: addHours(
			addMonths(curUnix, 1),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	const customer = await autumn.customers.get(customerId);
	expect(customer.invoices![0].total).toBe(0);

	const cusDiscount = await getDiscount({
		stripeCli,
		stripeId: customer.stripe_id!,
	});

	expect(cusDiscount).toBeDefined();

	expect(getOriginalCouponId(cusDiscount?.source.coupon?.id ?? "")).toBe(
		rewardId,
	);

	return {
		couponAmount,
		curUnix,
	};
};

test(
	chalk.yellow(
		`${testCase} - Testing invoice credits reward, apply to all product`,
	),
	async () => {
		const customerId = "coupon1";

		// Init scenario: products + customer (no PM, uses checkout)
		const { testClockId, ctx: testCtx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
			actions: [],
		});

		// Create reward manually (s.reward doesn't use onlyUsage, but this test needs apply_to_all)
		// LegacyVersion.v1_4 is needed for this test's autumn client
		const autumn = new AutumnInt({
			version: LegacyVersion.v1_4,
			secretKey: testCtx.orgSecretKey,
		});

		await createReward({
			orgId: testCtx.org.id,
			env: testCtx.env,
			db: testCtx.db,
			autumn,
			reward,
			productId: pro.id,
		});

		let couponAmount = reward.discount_config!.discount_value;
		let curUnix = Date.now();

		// CYCLE 0: Attach pro with promo code via checkout
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await completeCheckoutForm({ url: res.checkout_url, promoCode });

		await timeout(10000);

		couponAmount -= getBasePrice({ product: pro });

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({ customer, product: pro });

		expect(customer.invoices![0].total).toBe(0);

		const cusDiscount = await getDiscount({
			stripeCli: testCtx.stripeCli,
			stripeId: customer.stripe_id!,
		});

		expect(cusDiscount).toBeDefined();
		expect(getOriginalCouponId(cusDiscount?.source.coupon?.id ?? "")).toBe(
			rewardId,
		);

		// CYCLE 1: Run one cycle and verify correct invoice + coupon amount
		const res1 = await simulateOneCycle({
			customerId,
			stripeCli: testCtx.stripeCli,
			autumn,
			testClockId: testClockId!,
			couponAmount,
			curUnix: Date.now(),
			ctx: testCtx,
		});

		couponAmount = res1.couponAmount;
		curUnix = res1.curUnix;

		// CYCLE 2: Run another cycle and verify correct invoice + coupon amount
		await simulateOneCycle({
			customerId,
			stripeCli: testCtx.stripeCli,
			autumn,
			testClockId: testClockId!,
			couponAmount,
			curUnix,
			ctx: testCtx,
		});
	},
);
