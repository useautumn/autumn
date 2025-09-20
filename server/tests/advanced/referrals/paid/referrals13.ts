import {
    type AppEnv,
    CusExpand,
    CusProductStatus,
    ErrCode,
    type Organization,
    type ReferralCode,
    type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectProductV1Attached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
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

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;
		db = this.db;
		org = this.org;
		env = this.env;

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
		const res = await initCustomer({
			autumn: this.autumnJs,
			customerId: mainCustomerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockIds.push(res.testClockId);

		// Attach Pro product to main customer first
		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.pro.id,
		});

		const redeemerRes = await initCustomer({
			autumn: this.autumnJs,
			customerId: redeemer,
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: redeemerPM,
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);
	});

	it("should advance clock 10 days before redeeming", async () => {
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

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateReferrer.id,
		});

		assert.exists(referralCode.code);

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateReferrer.id,
		});

		assert.equal(referralCode2.code, referralCode.code);
	});

	it("should create redemption for redeemer and fail if redeemed again", async () => {
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
			assert.fail("Should not be able to redeem again");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

	it("should have referrer already on Pro, and redeemer gets free product", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		assert.equal(redemptionResult.redeemer_applied, true);

		const mainProds = (await autumn.customers.get(mainCustomerId)).products;
		const redeemerProds = (await autumn.customers.get(redeemer)).products;

		// Main customer (referrer) should have the pro product (already attached)
		assert.equal(mainProds.length, 1);
		assert.equal(mainProds[0].id, products.pro.id);

		// Redeemer should only have the free product (no pro product given in referrer-only program)
		assert.equal(redeemerProds.length, 1);
		assert.equal(redeemerProds[0].id, products.free.id);

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

	it("should advance test clock and verify referrer gets discount on next Pro cycle", async () => {
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

		console.log(
			"mainCustomerWithInvoices",
			mainCustomerWithInvoices.invoices
				.map(
					(x) =>
						`${x.product_ids.join(", ")}: ${x.total} | ${new Date(x.created_at).toLocaleDateString()}`,
				)
				.join("\n"),
		);
		const proInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(products.pro.id),
		);
		console.log("proInvoice", proInvoice);

        const expectedTotal = products.pro.prices[0].config.amount;
        console.log("expectedTotal", expectedTotal);
        const actualTotal = proInvoice?.total;
        console.log("actualTotal", actualTotal);

		if (proInvoice) {
			// Should have a discount applied - invoice total should be less than full Pro price ($10)
			assert.isBelow(
				actualTotal!,
				expectedTotal, // $10 in cents
				"Pro invoice should have discount applied, making it less than full price",
			);

			// For referrer-only reward, the discount should make it significantly cheaper or free
			assert.isAtMost(
				actualTotal!,
				expectedTotal / 2, // $5 or less in cents - assuming at least 50% discount
				"Referrer should get substantial discount on Pro product",
			);
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

				assert.exists(
					matchingProduct,
					`Customer ${customer.name} should have ${expectedProduct.name} product with status ${expectedProduct.status}. ${unMatchedProduct ? `However ${unMatchedProduct.product.name} with status ${unMatchedProduct.status} was found instead` : ""}`,
				);
			});
		});
	});
});
