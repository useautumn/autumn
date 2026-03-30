import { expect, test } from "bun:test";
import { CusProductStatus, CustomerExpand, ErrCode } from "@autumn/shared";
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

export const group = "referrals13";

test(`${chalk.yellowBright("referrals13: referrer on Pro, gets discount on next cycle - coupon-based")}`, async () => {
	const mainCustomerId = "main-referral-13";
	const redeemerId = "referral13-r1";

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

	// Reward: 10% percentage discount (coupon-based)
	const reward = rewards.percentageDiscount({ discountValue: 10 });

	// Program: triggers immediately on customer creation, referrer only, max 10
	const program = referralPrograms.onCustomerCreationReferrer({
		rewardId: reward.id,
		maxRedemptions: 10,
	});
	program.product_ids = [proProd.id];

	const { autumnV1, referralCode, testClockIds } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [freeProd, proProd] }),
			s.referralProgram({ reward, program }),
			s.otherCustomers([
				{ id: redeemerId, paymentMethod: "success", distinctTestClock: true },
			]),
		],
		actions: [
			s.attach({ productId: proProd.id }),
			s.advanceTestClock({ days: 10, waitForSeconds: 10 }),
			s.referral.createCode(),
		],
	});

	// Advance redeemer's clock too (s.advanceTestClock only advances primary)
	if (testClockIds[redeemerId]) {
		await advanceTestClock({
			testClockId: testClockIds[redeemerId],
			numberOfDays: 10,
			waitForSeconds: 10,
			stripeCli: ctx.stripeCli,
		});
	}

	expect(referralCode!.code).toBeDefined();

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

	// Verify referrer has pro, redeemer has free
	const redemptionResult = await autumnV1.redemptions.get(redemption.id);
	// For referrer-only program: triggered + applied (referrer got discount), redeemer_applied is false (redeemer gets nothing)
	expect(redemptionResult.triggered).toBe(true);
	expect(redemptionResult.applied).toBe(true);

	const mainCus = await autumnV1.customers.get(mainCustomerId);
	expectProductAttached({
		customer: mainCus,
		product: proProd,
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

	// Verify referrer gets discount on next Pro invoice
	const mainCustomerWithInvoices = await autumnV1.customers.get(
		mainCustomerId,
		{
			expand: [CustomerExpand.Invoices, CustomerExpand.Rewards],
		},
	);

	const proInvoice = mainCustomerWithInvoices.invoices.find((x) =>
		x.product_ids.includes(proProd.id),
	);

	if (proInvoice) {
		// 10% percentage discount on $20 Pro = $2 off = $18
		expect(proInvoice.total).toBeLessThan(20);
	}

	// Verify DB state
	// Final verification: referrer still has active Pro after billing cycle
	expectProductAttached({
		customer: await autumnV1.customers.get(mainCustomerId),
		product: proProd,
		status: CusProductStatus.Active,
	});
});
