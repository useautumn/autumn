import {
	type Customer,
	ErrCode,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { compareProductEntitlements } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { features, products, referralPrograms } from "../../global.js";

describe(`${chalk.yellowBright(
	"referrals3: Testing free product referrals",
)}`, () => {
	const mainCustomerId = "main-referral-3";
	const redeemers = ["referral3-r1", "referral3-r2", "referral3-r3"];
	let autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let testClockId: string;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];
	let mainCustomer: Customer;

	beforeAll(async () => {
		autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1, customer } = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			customerData: { fingerprint: "main-referral-3" },
		});
		testClockId = testClockId1;
		mainCustomer = customer;

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.proWithTrial.id,
		});

		const batchCreate = [];
		for (const redeemer of redeemers) {
			batchCreate.push(
				initCustomerV3({
					ctx,
					customerId: redeemer,
					attachPm: "success",
				}),
			);
		}

		await Promise.all(batchCreate);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.freeProduct.id,
		});

		expect(referralCode.code).toBeDefined();
	});

	test("should create redemption for each redeemer and fail if redeemed again", async () => {
		for (const redeemer of redeemers) {
			const redemption: RewardRedemption = await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});

			redemptions.push(redemption);
		}

		// Try redeem for redeemer1 again
		try {
			const redemption1 = await autumn.referrals.redeem({
				customerId: redeemers[0],
				code: referralCode.code,
			});
			throw new Error("Should not be able to redeem again");
		} catch (error) {
			expect(error).toBeInstanceOf(AutumnError);
			expect((error as AutumnError).code).toBe(ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

	test("should be triggered (and applied) when redeemers check out", async () => {
		for (let i = 0; i < redeemers.length; i++) {
			const redeemer = redeemers[i];

			await autumn.attach({
				customer_id: redeemer,
				product_id: products.pro.id,
			});

			await timeout(3000);

			// Get redemption object
			const redemption = await autumn.redemptions.get(redemptions[i].id);

			// Check if redemption is triggered
			const count = i + 1;

			if (count > referralPrograms.freeProduct.max_redemptions) {
				expect(redemption.triggered).toBe(false);
				expect(redemption.applied).toBe(false);
			} else {
				// 1. Check that main customer has free add on
				compareProductEntitlements({
					customerId: mainCustomerId,
					product: products.freeAddOn,
					features,
					quantity: count,
				});

				compareProductEntitlements({
					customerId: redeemer,
					product: products.freeAddOn,
					features,
				});
			}
		}
	});
});
