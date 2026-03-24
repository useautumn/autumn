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

	// Verify customer got 10 messages balance
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

		// Verify each redeemer got 10 messages
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

	// Verify 6th customer has no balance (balance is undefined or 0 when no entitlements exist)
	const check6 = await autumnV1.check({
		customer_id: allCustomerIds[5],
		feature_id: TestFeature.Messages,
	});
	expect(check6.balance ?? 0).toBe(0);
});
