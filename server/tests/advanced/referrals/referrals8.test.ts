import { expect, test } from "bun:test";
import {
	ApiVersion,
	findFeatureById,
	RewardReceivedBy,
	RewardTriggerEvent,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rewards } from "@tests/utils/fixtures/rewards";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

/**
 * Referrals8: Create a referral program through the public API
 *
 * Covers referral_programs.create end to end — the created program issues a
 * code, and redeeming it grants the linked feature grant reward.
 */

test(`${chalk.yellowBright("referrals8: referral_programs.create grants on redemption")}`, async () => {
	const mainCustomerId = "main-referral-8";
	const redeemerId = "referral8-r1";
	const grantedAllowance = 300;
	const programId = `referral8-program-${Date.now()}`;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});

	const messagesFeature = findFeatureById({
		features: ctx.features,
		featureId: items.lifetimeMessages({ includedUsage: 0 }).feature_id!,
	});

	const reward = rewards.featureGrant({
		id: `referral8-grant-${Date.now()}`,
		internalFeatureId: messagesFeature!.internal_id!,
		allowance: grantedAllowance,
		promoCode: `REFERRAL8GRANT${Date.now()}`,
	});

	const { autumnV1 } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.otherCustomers([{ id: redeemerId, paymentMethod: "success" }]),
		],
		actions: [],
	});

	await autumnV1.rewards.create(reward);

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	const program = await rpc.post("/referral_programs.create", {
		id: programId,
		reward_id: reward.id,
		redeem_on: RewardTriggerEvent.CustomerCreation,
		received_by: RewardReceivedBy.All,
		max_redemptions: 5,
	});

	expect(program.id).toBe(programId);
	expect(program.reward_id).toBe(reward.id);
	expect(program.created_at).toBeDefined();

	// The created program should behave like a dashboard-created one
	const { code } = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: programId,
	});

	expect(code).toBeDefined();

	await autumnV1.referrals.redeem({ customerId: redeemerId, code });

	for (const customerId of [mainCustomerId, redeemerId]) {
		const { balance } = await autumnV1.check({
			customer_id: customerId,
			feature_id: messagesFeature!.id,
		});

		expect(balance).toBe(grantedAllowance);
	}

	// Unknown rewards are rejected
	await expect(
		rpc.post("/referral_programs.create", {
			id: `${programId}-unknown-reward`,
			reward_id: "does-not-exist",
			redeem_on: RewardTriggerEvent.CustomerCreation,
			received_by: RewardReceivedBy.Referrer,
		}),
	).rejects.toThrow();

	// Checkout programs need plans and a usable redemption cap
	await expect(
		rpc.post("/referral_programs.create", {
			id: `${programId}-no-plans`,
			reward_id: reward.id,
			redeem_on: RewardTriggerEvent.Checkout,
			received_by: RewardReceivedBy.Referrer,
			max_redemptions: 5,
		}),
	).rejects.toThrow();

	await expect(
		rpc.post("/referral_programs.create", {
			id: `${programId}-zero-max`,
			reward_id: reward.id,
			redeem_on: RewardTriggerEvent.Checkout,
			received_by: RewardReceivedBy.Referrer,
			plan_ids: [pro.id],
			max_redemptions: 0,
		}),
	).rejects.toThrow();

	// Duplicate program IDs are rejected
	await expect(
		rpc.post("/referral_programs.create", {
			id: programId,
			reward_id: reward.id,
			redeem_on: RewardTriggerEvent.CustomerCreation,
			received_by: RewardReceivedBy.Referrer,
		}),
	).rejects.toThrow();
});
