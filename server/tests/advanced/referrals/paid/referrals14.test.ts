import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	type CreateRewardProgram,
	CusProductStatus,
	CustomerExpand,
	ErrCode,
	type Organization,
	type ReferralCode,
	RewardReceivedBy,
	type RewardRedemption,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { createReferralProgram } from "@tests/utils/productUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const group = "referrals14";

const testCase = "referrals14";

// Define products inline
const freeProd = constructProduct({
	id: "free",
	type: "free",
	isDefault: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
		}),
	],
});

const proProd = constructProduct({
	id: "pro",
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
		}),
	],
});

const premiumProd = constructProduct({
	id: "premium",
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

// Reward: pro_amount discount (coupon-based)
const proAmountReward: CreateReward = {
	id: `${testCase}ProAmount`,
	name: "Pro Amount Discount",
	type: RewardType.PercentageDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: 10, // $10 off (pro_amount)
		duration_type: CouponDurationType.Months,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
};

// Referral program: triggers immediately, applies to referrer only
const paidProductImmediateReferrer: CreateRewardProgram = {
	id: `${testCase}ImmediateReferrer`,
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [proProd.id, premiumProd.id],
	internal_reward_id: proAmountReward.id,
	max_redemptions: 10,
	received_by: RewardReceivedBy.Referrer,
};

describe(`${chalk.yellowBright(
	"referrals14: Testing referrals - referrer on Premium (higher tier), gets pro_amount discount - coupon-based",
)}`, () => {
	const mainCustomerId = "main-referral-14";
	const redeemer = "referral14-r1";
	const redeemerPM = "success";
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	const testClockIds: string[] = [];
	let referralCode: ReferralCode;

	let redemption: RewardRedemption;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		try {
			await Promise.all([
				autumn.customers.delete(mainCustomerId, { deleteInStripe: true }),
				autumn.customers.delete(redeemer, { deleteInStripe: true }),
				RewardRedemptionService._resetCustomerRedemptions({
					db,
					internalCustomerId: [mainCustomerId, redeemer],
				}),
			]);
		} catch {}

		// Initialize products first
		await initProductsV0({
			ctx,
			products: [freeProd, proProd, premiumProd],
			prefix: testCase,
			customerId: mainCustomerId,
		});

		// Create referral program
		await createReferralProgram({
			db,
			orgId: org.id,
			env,
			autumn: new AutumnInt({ secretKey: ctx.orgSecretKey }),
			reward: proAmountReward,
			rewardProgram: paidProductImmediateReferrer,
		});

		// Initialize main customer with Premium product already attached
		const res = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			attachPm: "success",
		});

		testClockIds.push(res.testClockId);

		// Attach Premium product to main customer first (higher tier than Pro)
		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: premiumProd.id,
		});

		const redeemerRes = await initCustomerV3({
			ctx,
			customerId: redeemer,
			attachPm: redeemerPM as "success",
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);

		// Advance 10 days after Premium is attached, then redeem the code
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 10,
					waitForSeconds: 5,
					stripeCli,
				}),
			),
		);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: paidProductImmediateReferrer.id,
		});

		expect(referralCode.code).toBeDefined();

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: paidProductImmediateReferrer.id,
		});

		expect(referralCode2.code).toBe(referralCode.code);
	});

	test("should create redemption for redeemer and fail if redeemed again", async () => {
		redemption = await autumn.referrals.redeem({
			customerId: redeemer,
			code: referralCode.code,
		});

		// Try redeem for redeemer again
		try {
			await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});
			throw new Error("Should not be able to redeem again");
		} catch (error) {
			expect(error).toBeInstanceOf(AutumnError);
			expect((error as AutumnError).code).toBe(
				ErrCode.CustomerAlreadyRedeemedReferralCode,
			);
		}
	});

	test("should have referrer already on Premium, and redeemer gets free product", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		expect(redemptionResult.redeemer_applied).toBe(true);

		const mainCus = await autumn.customers.get(mainCustomerId);
		const redeemerCus = await autumn.customers.get(redeemer);
		const mainProds = mainCus.products;
		const redeemerProds = redeemerCus.products;

		// Main customer (referrer) should have the premium product (already attached)
		expect(mainProds.length).toBe(1);
		expect(mainProds[0].id).toBe(premiumProd.id);

		// Redeemer should only have the free product (no pro product given in referrer-only program)
		expect(redeemerProds.length).toBe(1);
		expect(redeemerProds[0].id).toBe(freeProd.id);

		// expectProductV1Attached({
		// 	customer: mainCus,
		// 	product: premiumProd,
		// 	status: CusProductStatus.Active,
		// });
		expectProductAttached({
			customer: mainCus,
			product: premiumProd,
			status: CusProductStatus.Active,
		});

		expectProductAttached({
			customer: redeemerCus,
			product: freeProd,
			status: CusProductStatus.Active,
		});
	});

	test("should advance test clock and verify referrer gets pro_amount discount on Premium cycle", async () => {
		// Advance 21 more days (total 31 days from start) to trigger next billing cycle
		// Coupon was applied on day 10, lasts 30 days, so should still be active on day 31
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 31,
					waitForSeconds: 25,
					stripeCli,
				}),
			),
		);

		// Test that main customer's Premium invoice has pro_amount discount applied
		const mainCustomerWithInvoices = await autumn.customers.get(
			mainCustomerId,
			{
				expand: [CustomerExpand.Invoices],
			},
		);

		const premiumInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(premiumProd.id),
		);
		if (premiumInvoice) {
			// Premium costs $50, Pro costs $20 - so referrer should get $10 discount on Premium
			// Expected: Premium ($50) - discount amount ($10) = $40
			const premiumPrice = 50; // Premium product base price
			const proAmount = 10; // Discount amount (pro_amount)
			const expectedTotal = premiumPrice - proAmount; // $40

			// The invoice total should be exactly Premium price minus pro_amount
			expect(premiumInvoice.total).toBe(expectedTotal);

			// Verify that the discount was applied (total is less than full Premium price)
			expect(premiumInvoice.total).toBeLessThan(premiumPrice);
		}

		const dbCustomers = await Promise.all(
			[mainCustomerId, redeemer].map((x) =>
				CusService.getFull({
					db,
					idOrInternalId: x,
					orgId: org.id,
					env,
					inStatuses: [
						CusProductStatus.Active,
						CusProductStatus.PastDue,
						CusProductStatus.Expired,
					],
				}),
			),
		);

		const expectedProducts = [
			[
				// Main referrer - keeps Premium with pro_amount discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Premium", status: CusProductStatus.Active },
			],
			[
				// Redeemer - only has free product (no reward in referrer-only program)
				{ name: "Free", status: CusProductStatus.Active },
			],
		];

		dbCustomers.forEach((customer, index) => {
			const expectedProductsForCustomer = expectedProducts[index];
			expectedProductsForCustomer.forEach((expectedProduct) => {
				const matchingProduct = customer.customer_products.find(
					(cp) =>
						cp.product.name === expectedProduct.name &&
						cp.status === expectedProduct.status,
				);

				expect(matchingProduct).toBeDefined();
			});
		});
	});
});
