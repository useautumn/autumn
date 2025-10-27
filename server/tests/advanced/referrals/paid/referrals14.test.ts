import {
	type AppEnv,
	CusExpand,
	CusProductStatus,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { expectProductV1Attached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals14";

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
			product_id: products.premium.id,
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
			referralId: referralPrograms.paidProductImmediateReferrer.id,
		});

		expect(referralCode.code).toBeDefined();

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateReferrer.id,
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
			expect((error as AutumnError).code).toBe(ErrCode.CustomerAlreadyRedeemedReferralCode);
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
		expect(mainProds[0].id).toBe(products.premium.id);

		// Redeemer should only have the free product (no pro product given in referrer-only program)
		expect(redeemerProds.length).toBe(1);
		expect(redeemerProds[0].id).toBe(products.free.id);

		expectProductV1Attached({
			customer: mainCus,
			product: products.premium,
			status: CusProductStatus.Active,
		});

		// Verify redeemer only has free product
		expectProductV1Attached({
			customer: redeemerCus,
			product: products.free,
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
				expand: [CusExpand.Invoices],
			},
		);

		const premiumInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(products.premium.id),
		);
		if (premiumInvoice) {
			// Premium costs $50, Pro costs $10 - so referrer should get $10 discount on Premium
			// Expected: Premium ($50) - Pro amount ($10) = $40
			const premiumPrice = products.premium.prices[0].config.amount; // $50
			const proAmount = products.pro.prices[0].config.amount; // $10 (pro_amount discount)
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
				const unMatchedProduct = customer.customer_products.find(
					(cp) => cp.product.name === expectedProduct.name,
				);

				expect(matchingProduct).toBeDefined();
			});
		});
	});
});
