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

test(`${chalk.yellowBright("referrals9: rewards + referral_programs CRUD")}`, async () => {
	const customerId = "main-referral-9";
	const stamp = Date.now();
	const rewardId = `referral9-grant-${stamp}`;
	const programId = `referral9-program-${stamp}`;

	const pro = products.pro({
		id: "pro",
		items: [
			items.monthlyWords({ includedUsage: 0 }),
			items.lifetimeMessages({ includedUsage: 0 }),
		],
	});

	const messagesFeature = findFeatureById({
		features: ctx.features,
		featureId: items.lifetimeMessages({ includedUsage: 0 }).feature_id!,
	});

	const reward = rewards.featureGrant({
		id: rewardId,
		internalFeatureId: messagesFeature!.internal_id!,
		allowance: 100,
		promoCode: `REFERRAL9GRANT${stamp}`,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV1.rewards.create(reward);

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
		baseUrl: process.env.AUTUMN_TEST_RPC_URL,
	});

	const fetched = await rpc.post("/rewards.get", { reward_id: rewardId });
	expect(fetched.feature_grant?.id).toBe(rewardId);
	expect(fetched.feature_grant?.grants[0].included).toBe(100);
	expect(fetched.coupon).toBeUndefined();

	const renamed = await rpc.post("/rewards.update", {
		reward_id: rewardId,
		feature_grant: { name: "Renamed Grant" },
	});
	expect(renamed.feature_grant?.name).toBe("Renamed Grant");
	expect(renamed.feature_grant?.grants[0].included).toBe(100);

	const regranted = await rpc.post("/rewards.update", {
		reward_id: rewardId,
		feature_grant: {
			grants: [
				{ feature_id: messagesFeature!.id, included: 250, expiry: null },
			],
		},
	});
	expect(regranted.feature_grant?.grants[0].included).toBe(250);
	expect(regranted.feature_grant?.name).toBe("Renamed Grant");

	const created = await rpc.post("/referral_programs.create", {
		id: programId,
		reward_id: rewardId,
		redeem_on: RewardTriggerEvent.CustomerCreation,
		received_by: RewardReceivedBy.Referrer,
		max_redemptions: 5,
	});
	expect(created.id).toBe(programId);

	const gotProgram = await rpc.post("/referral_programs.get", {
		referral_program_id: programId,
	});
	expect(gotProgram.reward_id).toBe(rewardId);
	expect(gotProgram.max_redemptions).toBe(5);

	const listed = await rpc.post("/referral_programs.list", {});
	expect(
		listed.list.some((program: { id: string }) => program.id === programId),
	).toBe(true);

	const updatedProgram = await rpc.post("/referral_programs.update", {
		referral_program_id: programId,
		received_by: RewardReceivedBy.All,
	});
	expect(updatedProgram.received_by).toBe(RewardReceivedBy.All);
	expect(updatedProgram.max_redemptions).toBe(5);
	expect(updatedProgram.reward_id).toBe(rewardId);

	await expect(
		rpc.post("/rewards.delete", { reward_id: rewardId }),
	).rejects.toThrow();

	const deletedProgram = await rpc.post("/referral_programs.delete", {
		referral_program_id: programId,
	});
	expect(deletedProgram).toEqual({ success: true });

	await expect(
		rpc.post("/referral_programs.get", { referral_program_id: programId }),
	).rejects.toThrow();

	const deletedReward = await rpc.post("/rewards.delete", {
		reward_id: rewardId,
	});
	expect(deletedReward).toEqual({ success: true });

	await expect(
		rpc.post("/rewards.get", { reward_id: rewardId }),
	).rejects.toThrow();
});
