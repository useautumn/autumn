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

export const group = "referrals15";

const testCase = "referrals15";

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

// Referral program: triggers immediately, applies to both referrer and redeemer
const paidProductImmediateAll: CreateRewardProgram = {
	id: `${testCase}ImmediateAll`,
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [proProd.id],
	internal_reward_id: proAmountReward.id,
	max_redemptions: 10,
	received_by: RewardReceivedBy.All,
};

describe(`${chalk.yellowBright(
	"referrals15: Testing referrals - referrer starts with no product, gets pro_amount discount - immediate, both - coupon-based",
)}`, () => {
	const mainCustomerId = "main-referral-15";
	const redeemer = "referral15-r1";
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
			products: [freeProd, proProd],
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
			rewardProgram: paidProductImmediateAll,
		});

		// Initialize main customer with NO paid product (just free tier)
		const res = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			attachPm: "success",
		});

		testClockIds.push(res.testClockId);

		const redeemerRes = await initCustomerV3({
			ctx,
			customerId: redeemer,
			attachPm: redeemerPM as "success",
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);
	});

	test("should advance clock 10 days before redeeming", async () => {
		// Advance 10 days after setup
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 10,
					waitForSeconds: 10,
					stripeCli,
				}),
			),
		);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: paidProductImmediateAll.id,
		});

		expect(referralCode.code).toBeDefined();

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: paidProductImmediateAll.id,
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

	test("should have both referrer and redeemer get pro product", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		expect(redemptionResult.redeemer_applied).toBe(true);

		const mainCus = await autumn.customers.get(mainCustomerId);
		const redeemerCus = await autumn.customers.get(redeemer);
		const mainProds = mainCus.products;
		const redeemerProds = redeemerCus.products;

		// Main customer (referrer) should now have the pro product
		expect(mainProds.length).toBe(1);
		expect(mainProds[0].id).toBe(proProd.id);

		// Redeemer should also have the pro product (both get reward)
		expect(redeemerProds.length).toBe(1);
		expect(redeemerProds[0].id).toBe(proProd.id);

		expectProductAttached({
			customer: mainCus,
			product: proProd,
			status: CusProductStatus.Active,
		});

		expectProductAttached({
			customer: redeemerCus,
			product: proProd,
			status: CusProductStatus.Active,
		});
	});

	test("should advance test clock and verify both customers get pro_amount discount on Pro cycle", async () => {
		// Advance 31 days from current time to trigger next billing cycle
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

		// Test that both customers' Pro invoices have pro_amount discount applied
		const [mainCustomerWithInvoices, redeemerWithInvoices] = await Promise.all([
			autumn.customers.get(mainCustomerId, {
				expand: [CustomerExpand.Invoices],
			}),
			autumn.customers.get(redeemer, {
				expand: [CustomerExpand.Invoices],
			}),
		]);

		// Check main customer (referrer) invoice
		const mainProInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(proProd.id),
		);
		if (mainProInvoice) {
			// Pro costs $20, so with $10 discount it should be $10
			const proPrice = 20; // Pro product base price
			const proAmount = 10; // Discount amount (pro_amount)
			const expectedTotal = proPrice - proAmount; // $10

			expect(mainProInvoice.total).toBe(expectedTotal);
		}

		// Check redeemer invoice
		const redeemerProInvoice = redeemerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(proProd.id),
		);
		if (redeemerProInvoice) {
			// Pro costs $20, so with $10 discount it should be $10
			const proPrice = 20; // Pro product base price
			const proAmount = 10; // Discount amount (pro_amount)
			const expectedTotal = proPrice - proAmount; // $10

			expect(redeemerProInvoice.total).toBe(expectedTotal);
		}

	const dbCustomers = await Promise.all(
		[mainCustomerId, redeemer].map((x) =>
			CusService.getFull({
				ctx,
				idOrInternalId: x,
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
				// Main referrer - has Pro with pro_amount discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
			[
				// Redeemer - also has Pro with pro_amount discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
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
