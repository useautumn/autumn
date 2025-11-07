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

export const group = "referrals13";

describe(`${chalk.yellowBright(
	"referrals13: Testing referrals - referrer on Pro, gets discount on next cycle - coupon-based",
)}`, () => {
	const mainCustomerId = "main-referral-13";
	const redeemer = "referral13-r1";
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
				autumn.customers.delete(mainCustomerId),
				autumn.customers.delete(redeemer),
				RewardRedemptionService._resetCustomerRedemptions({
					db,
					internalCustomerId: [mainCustomerId, redeemer],
				}),
			]);
		} catch {}

		// Initialize main customer with Pro product already attached
		const res = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			attachPm: "success",
		});

		testClockIds.push(res.testClockId);

		// Attach Pro product to main customer first
		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.pro.id,
		});

		const redeemerRes = await initCustomerV3({
			ctx,
			customerId: redeemer,
			attachPm: redeemerPM as "success",
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);
	});

	test("should advance clock 10 days before redeeming", async () => {
		// Advance 10 days after Pro is attached
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
			referralId: referralPrograms.paidProductImmediateReferrer.id,
		});

		expect(referralCode.code).toBeDefined();
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

	test("should have referrer already on Pro, and redeemer gets free product", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		expect(redemptionResult.redeemer_applied).toBe(true);

		const mainProds = (await autumn.customers.get(mainCustomerId)).products;
		const redeemerProds = (await autumn.customers.get(redeemer)).products;

		// Main customer (referrer) should have the pro product (already attached)
		expect(mainProds.length).toBe(1);
		expect(mainProds[0].id).toBe(products.pro.id);

		// Redeemer should only have the free product (no pro product given in referrer-only program)
		expect(redeemerProds.length).toBe(1);
		expect(redeemerProds[0].id).toBe(products.free.id);

		expectProductV1Attached({
			customer: await autumn.customers.get(mainCustomerId),
			product: products.pro,
			status: CusProductStatus.Active,
		});

		// Verify redeemer only has free product
		expectProductV1Attached({
			customer: await autumn.customers.get(redeemer),
			product: products.free,
			status: CusProductStatus.Active,
		});
	});

	test("should advance test clock and verify referrer gets discount on next Pro cycle", async () => {
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

		// Test that main customer's Pro invoice has discount applied
		const mainCustomerWithInvoices = await autumn.customers.get(
			mainCustomerId,
			{
				expand: [CusExpand.Invoices, CusExpand.Rewards],
			},
		);

		const proInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(products.pro.id),
		);

		const expectedTotal = products.pro.prices[0].config.amount;

		const actualTotal = proInvoice?.total;

		if (proInvoice) {
			// Should have a discount applied - invoice total should be less than full Pro price ($10)
			expect(actualTotal!).toBeLessThan(expectedTotal);

			// For referrer-only reward, the discount should make it significantly cheaper or free
			expect(actualTotal!).toBeLessThanOrEqual(expectedTotal / 2);
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
				// Main referrer - keeps Pro with discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
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
