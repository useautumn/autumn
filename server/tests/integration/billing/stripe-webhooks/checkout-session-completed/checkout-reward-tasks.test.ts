/**
 * Checkout Reward Tasks Tests
 *
 * Tests that checkout reward tasks (referrals, coupons, etc.) are triggered
 * correctly when checkout.session.completed webhook fires.
 *
 * These tests verify:
 * - Legacy checkout flow triggers rewards via queueCheckoutRewardTasks
 * - V2 attach flow triggers rewards via queueCheckoutRewardTasks
 */

import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	type CreateRewardProgram,
	type Organization,
	type ReferralCode,
	RewardReceivedBy,
	type RewardRedemption,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { createReferralProgram } from "@tests/utils/productUtils.js";
import {
	advanceTestClock,
	completeCheckoutForm,
} from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Legacy checkout flow triggers referral rewards
// ═══════════════════════════════════════════════════════════════════════════════

describe(`${chalk.yellowBright("checkout-reward-tasks: legacy checkout triggers referral rewards")}`, () => {
	const testCase = "checkout-reward-legacy";
	const mainCustomerId = `${testCase}-main`;
	const redeemers = [`${testCase}-r1`, `${testCase}-r2`];

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-reward",
		items: [messagesItem],
	});

	// Reward: 100% discount for 1 month
	const monthOffReward: CreateReward = {
		id: `${testCase}MonthOff`,
		name: "Month Off",
		type: RewardType.PercentageDiscount,
		promo_codes: [],
		discount_config: {
			discount_value: 100,
			duration_type: CouponDurationType.Months,
			duration_value: 1,
			apply_to_all: true,
			price_ids: [],
		},
	};

	// Referral program: triggers on checkout
	const onCheckoutProgram: CreateRewardProgram = {
		id: `${testCase}OnCheckout`,
		when: RewardTriggerEvent.Checkout,
		product_ids: [pro.id],
		internal_reward_id: monthOffReward.id,
		max_redemptions: 2,
		received_by: RewardReceivedBy.Referrer,
	};

	let autumn: AutumnInt;
	let stripeCli: Stripe;
	let testClockId: string;
	let referralCode: ReferralCode;
	const redemptions: RewardRedemption[] = [];
	let mainCustomer: ApiCustomerV3;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		// Setup main customer with product
		const { autumnV1, testClockId: clockId } = await initScenario({
			customerId: mainCustomerId,
			setup: [
				s.customer({
					testClock: true,
					attachPm: "success",
					fingerprint: mainCustomerId,
				}),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		autumn = autumnV1;
		testClockId = clockId!;

		// Create referral program
		await createReferralProgram({
			db,
			orgId: org.id,
			env,
			autumn: new AutumnInt({ secretKey: ctx.orgSecretKey }),
			reward: monthOffReward,
			rewardProgram: {
				...onCheckoutProgram,
				product_ids: [pro.id],
			},
		});

		mainCustomer = await autumn.customers.get<ApiCustomerV3>(mainCustomerId);

		// Setup redeemers (no payment method - will use checkout flow)
		for (const redeemer of redeemers) {
			await initScenario({
				customerId: redeemer,
				setup: [
					s.customer({ testClock: true }), // No payment method!
					s.products({ list: [pro] }),
				],
				actions: [],
			});
		}
	});

	test("should create referral code", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: onCheckoutProgram.id,
		});
		expect(referralCode.code).toBeDefined();
	});

	test("should create redemptions for redeemers", async () => {
		for (const redeemer of redeemers) {
			const redemption: RewardRedemption = await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});
			redemptions.push(redemption);
		}
		expect(redemptions.length).toBe(2);
	});

	test("should trigger rewards when redeemers checkout via stripe checkout", async () => {
		for (let i = 0; i < redeemers.length; i++) {
			const redeemer = redeemers[i];

			// Attach via stripe checkout (no payment method → returns checkout_url)
			const result = await autumn.billing.attach({
				customer_id: redeemer,
				product_id: pro.id,
			});

			expect(result.payment_url).toBeDefined();
			expect(result.payment_url).toContain("checkout.stripe.com");

			// Complete checkout
			await completeCheckoutForm(result.payment_url);
			await timeout(10000); // Wait for webhook + reward processing

			// Verify product attached
			const customer = await autumn.customers.get<ApiCustomerV3>(redeemer);
			await expectProductActive({ customer, productId: pro.id });

			// Verify redemption was triggered
			const redemption = await autumn.redemptions.get(redemptions[i].id);
			expect(redemption.triggered).toBe(true);

			// First redemption should be applied (discount on main customer)
			if (i === 0) {
				expect(redemption.applied).toBe(true);
			}
		}

		// Verify main customer has discount
		const stripeProcessorId = mainCustomer.processor?.id;
		if (stripeProcessorId) {
			const stripeCus = (await stripeCli.customers.retrieve(
				stripeProcessorId,
			)) as Stripe.Customer;
			expect(stripeCus.discount).not.toBe(null);
		}
	});

	test("main customer should have discount on next invoice", async () => {
		const curTime = addDays(new Date(), 11);
		await advanceTestClock({
			testClockId,
			advanceTo: curTime.getTime(),
			stripeCli,
		});

		await timeout(5000);

		const { invoices } =
			await autumn.customers.get<ApiCustomerV3>(mainCustomerId);
		expect(invoices.length).toBeGreaterThanOrEqual(2);
		// First invoice should be $0 due to discount
		expect(invoices[0].total).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: V2 attach flow triggers referral rewards
// ═══════════════════════════════════════════════════════════════════════════════

describe(`${chalk.yellowBright("checkout-reward-tasks: v2 attach triggers referral rewards")}`, () => {
	const testCase = "checkout-reward-v2";
	const mainCustomerId = `${testCase}-main`;
	const redeemerId = `${testCase}-redeemer`;

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-reward-v2",
		items: [messagesItem],
	});

	// Reward: 50% discount for 1 month
	const discountReward: CreateReward = {
		id: `${testCase}Discount`,
		name: "Half Off",
		type: RewardType.PercentageDiscount,
		promo_codes: [],
		discount_config: {
			discount_value: 50,
			duration_type: CouponDurationType.Months,
			duration_value: 1,
			apply_to_all: true,
			price_ids: [],
		},
	};

	// Referral program: triggers on checkout
	const onCheckoutProgram: CreateRewardProgram = {
		id: `${testCase}OnCheckout`,
		when: RewardTriggerEvent.Checkout,
		product_ids: [pro.id],
		internal_reward_id: discountReward.id,
		max_redemptions: 1,
		received_by: RewardReceivedBy.Referrer,
	};

	let autumn: AutumnInt;
	let stripeCli: Stripe;
	let referralCode: ReferralCode;
	let redemption: RewardRedemption;
	let mainCustomer: ApiCustomerV3;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		// Setup main customer with product
		const { autumnV1 } = await initScenario({
			customerId: mainCustomerId,
			setup: [
				s.customer({
					testClock: true,
					attachPm: "success",
					fingerprint: mainCustomerId,
				}),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		autumn = autumnV1;

		// Create referral program
		await createReferralProgram({
			db,
			orgId: org.id,
			env,
			autumn: new AutumnInt({ secretKey: ctx.orgSecretKey }),
			reward: discountReward,
			rewardProgram: {
				...onCheckoutProgram,
				product_ids: [pro.id],
			},
		});

		mainCustomer = await autumn.customers.get<ApiCustomerV3>(mainCustomerId);

		// Setup redeemer WITH payment method (will use V2 attach flow, not checkout)
		await initScenario({
			customerId: redeemerId,
			setup: [
				s.customer({ testClock: true, attachPm: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
	});

	test("should create referral code and redemption", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: onCheckoutProgram.id,
		});
		expect(referralCode.code).toBeDefined();

		redemption = await autumn.referrals.redeem({
			customerId: redeemerId,
			code: referralCode.code,
		});
		expect(redemption.id).toBeDefined();
	});

	test("should trigger reward when redeemer attaches via v2 flow (with payment method)", async () => {
		// Attach directly (has payment method → direct charge, not checkout URL)
		const result = await autumn.billing.attach({
			customer_id: redeemerId,
			product_id: pro.id,
		});

		// Should NOT return payment_url since customer has payment method
		// V2 flow charges directly
		expect(result.payment_url).toBeUndefined();

		await timeout(8000); // Wait for reward processing

		// Verify product attached
		const customer = await autumn.customers.get<ApiCustomerV3>(redeemerId);
		await expectProductActive({ customer, productId: pro.id });

		// Verify redemption was triggered and applied
		const updatedRedemption = await autumn.redemptions.get(redemption.id);
		expect(updatedRedemption.triggered).toBe(true);
		expect(updatedRedemption.applied).toBe(true);

		// Verify main customer has discount
		const stripeProcessorId = mainCustomer.processor?.id;
		if (stripeProcessorId) {
			const stripeCus = (await stripeCli.customers.retrieve(
				stripeProcessorId,
			)) as Stripe.Customer;
			expect(stripeCus.discount).not.toBe(null);
		}
	});
});
