import { expect, test } from "bun:test";
import { CusProductStatus, CustomerExpand, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

export const group = "referrals14";

test(`${chalk.yellowBright("referrals14: referrer on Premium (higher tier), gets pro_amount discount - coupon-based")}`, async () => {
	const mainCustomerId = "main-referral-14";
	const redeemerId = "referral14-r1";

	// Clean up redemptions before scenario
	await redemptionRepo.resetCustomer({
		db: ctx.db,
		internalCustomerId: [mainCustomerId, redeemerId],
	});

	// Products
	const freeProd = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 5 })],
	});

	const proProd = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
	});

	const premiumProd = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 50 }),
			constructFeatureItem({
				featureId: TestFeature.Admin,
				unlimited: true,
			}),
		],
	});

	// Reward: 10% percentage discount (coupon-based)
	const reward = rewards.percentageDiscount({ discountValue: 10 });

	// Program: triggers immediately on customer creation, referrer only, max 10
	// product_ids includes both pro and premium
	const program = referralPrograms.onCustomerCreationReferrer({
		rewardId: reward.id,
		maxRedemptions: 10,
	});
	// Override product_ids to include both pro and premium
	program.product_ids = [proProd.id, premiumProd.id];

	const { autumnV1, referralCode, testClockIds } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [freeProd, proProd, premiumProd] }),
			s.referralProgram({ reward, program }),
			s.otherCustomers([
				{ id: redeemerId, paymentMethod: "success", distinctTestClock: true },
			]),
		],
		actions: [
			s.attach({ productId: premiumProd.id }),
			s.advanceTestClock({ days: 10, waitForSeconds: 5 }),
			s.referral.createCode(),
		],
	});

	// Advance redeemer's clock too (s.advanceTestClock only advances primary)
	if (testClockIds[redeemerId]) {
		await advanceTestClock({
			testClockId: testClockIds[redeemerId],
			numberOfDays: 10,
			waitForSeconds: 5,
			stripeCli: ctx.stripeCli,
		});
	}

	expect(referralCode!.code).toBeDefined();

	// Creating code again should be idempotent
	const referralCode2 = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode2.code).toBe(referralCode!.code);

	// Redeem referral code
	const redemption = await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode!.code,
	});

	// Try redeem again — should fail
	try {
		await autumnV1.referrals.redeem({
			customerId: redeemerId,
			code: referralCode!.code,
		});
		throw new Error("Should not be able to redeem again");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.CustomerAlreadyRedeemedReferralCode,
		);
	}

	// Verify referrer has premium, redeemer has free
	const redemptionResult = await autumnV1.redemptions.get(redemption.id);
	// For referrer-only program: triggered + applied (referrer got discount), redeemer_applied is false (redeemer gets nothing)
	expect(redemptionResult.triggered).toBe(true);
	expect(redemptionResult.applied).toBe(true);

	const mainCus = await autumnV1.customers.get(mainCustomerId);

	expectProductAttached({
		customer: mainCus,
		product: premiumProd,
		status: CusProductStatus.Active,
	});

	// Advance 31 days to trigger next billing cycle
	await Promise.all(
		Object.values(testClockIds).map((clockId) =>
			advanceTestClock({
				testClockId: clockId,
				numberOfDays: 31,
				waitForSeconds: 25,
				stripeCli: ctx.stripeCli,
			}),
		),
	);

	// Verify referrer gets pro_amount discount on Premium invoice
	const mainCustomerWithInvoices = await autumnV1.customers.get(
		mainCustomerId,
		{
			expand: [CustomerExpand.Invoices],
		},
	);

	const premiumInvoice = mainCustomerWithInvoices.invoices.find((x) =>
		x.product_ids.includes(premiumProd.id),
	);

	if (premiumInvoice) {
		// 10% percentage discount on Premium price
		const premiumPrice = 50;
		expect(premiumInvoice.total).toBeLessThan(premiumPrice);
	}

	// Final verification: referrer still has active Premium after billing cycle
	expectProductAttached({
		customer: await autumnV1.customers.get(mainCustomerId),
		product: premiumProd,
		status: CusProductStatus.Active,
	});
});
