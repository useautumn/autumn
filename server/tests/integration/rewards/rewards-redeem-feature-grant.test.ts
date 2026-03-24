import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";

test(`${chalk.yellowBright("feature-grant-1: redeem simple 10 message promo code")}`, async () => {
	const customerId = "feature-grant-1";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
				promoCodes: [{ code: "MESSAGES10" }],
			}),
		],
		actions: [s.rewards.redeem({ code: "MESSAGES10" })],
	});

	const check = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	expect(check.allowed).toBe(true);
	expect(check.balance).toBe(10);
});

test(`${chalk.yellowBright("feature-grant-2: promo code with max 5 redemptions across 6 customers")}`, async () => {
	const mainCustomerId = "feature-grant-2";
	const otherIds = ["fg2-c1", "fg2-c2", "fg2-c3", "fg2-c4", "fg2-c5"];

	const { autumnV1 } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherIds.map((id) => ({ id }))),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
				promoCodes: [{ code: "LIMITEDMSG", max_redemptions: 5 }],
			}),
		],
		actions: [],
	});

	// First 5 customers redeem successfully
	const allCustomerIds = [mainCustomerId, ...otherIds];
	for (let i = 0; i < 5; i++) {
		await autumnV1.rewards.redeem({
			code: "LIMITEDMSG",
			customerId: allCustomerIds[i],
		});

		const check = await autumnV1.check({
			customer_id: allCustomerIds[i],
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance).toBe(10);
	}

	// 6th customer should fail — max redemptions reached
	try {
		await autumnV1.rewards.redeem({
			code: "LIMITEDMSG",
			customerId: allCustomerIds[5],
		});
		throw new Error("Should have failed — max redemptions reached");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.ReferralCodeMaxRedemptionsReached,
		);
	}

	const check6 = await autumnV1.check({
		customer_id: allCustomerIds[5],
		feature_id: TestFeature.Messages,
	});
	expect(check6.balance ?? 0).toBe(0);
});

test(`${chalk.yellowBright("feature-grant-3: multiple entitlements per reward (messages + words)")}`, async () => {
	const customerId = "feature-grant-3";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.featureGrant({
				entitlements: [
					{ feature_id: TestFeature.Messages, allowance: 50 },
					{ feature_id: TestFeature.Words, allowance: 1000 },
				],
				promoCodes: [{ code: "MULTIFEATURE" }],
			}),
		],
		actions: [s.rewards.redeem({ code: "MULTIFEATURE" })],
	});

	const checkMessages = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(checkMessages.allowed).toBe(true);
	expect(checkMessages.balance).toBe(50);

	const checkWords = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Words,
	});
	expect(checkWords.allowed).toBe(true);
	expect(checkWords.balance).toBe(1000);
});

test(`${chalk.yellowBright("feature-grant-4: duplicate redemption blocked")}`, async () => {
	const customerId = "feature-grant-4";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
				promoCodes: [{ code: "NODUPE" }],
			}),
		],
		actions: [s.rewards.redeem({ code: "NODUPE" })],
	});

	// First redemption worked
	const check = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.allowed).toBe(true);
	expect(check.balance).toBe(10);

	// Second redemption by same customer should fail
	try {
		await autumnV1.rewards.redeem({
			code: "NODUPE",
			customerId,
		});
		throw new Error("Should have failed — already redeemed");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.CustomerAlreadyRedeemedReferralCode,
		);
	}

	// Balance should still be 10, not 20
	const checkAfter = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(checkAfter.balance).toBe(10);
});

test(`${chalk.yellowBright("feature-grant-5: multiple promo codes on one reward")}`, async () => {
	const customer1 = "feature-grant-5a";
	const customer2 = "feature-grant-5b";

	const { autumnV1 } = await initScenario({
		customerId: customer1,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: customer2 }]),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 25 }],
				promoCodes: [
					{ code: "CODEAAA", max_redemptions: 1 },
					{ code: "CODEBBB", max_redemptions: 1 },
				],
			}),
		],
		actions: [],
	});

	// Customer 1 redeems CODEAAA
	await autumnV1.rewards.redeem({ code: "CODEAAA", customerId: customer1 });

	const check1 = await autumnV1.check({
		customer_id: customer1,
		feature_id: TestFeature.Messages,
	});
	expect(check1.allowed).toBe(true);
	expect(check1.balance).toBe(25);

	// Customer 2 redeems CODEBBB (different code, same reward)
	await autumnV1.rewards.redeem({ code: "CODEBBB", customerId: customer2 });

	const check2 = await autumnV1.check({
		customer_id: customer2,
		feature_id: TestFeature.Messages,
	});
	expect(check2.allowed).toBe(true);
	expect(check2.balance).toBe(25);
});
