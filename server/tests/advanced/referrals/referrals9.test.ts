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
 * Referrals9: Full CRUD over rewards and referral programs on the public API
 *
 * Covers get/list/update/delete for both resources, plus the guard that a
 * reward linked to a referral program cannot be deleted.
 */

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

	// --- rewards.get ---
	const fetched = await rpc.post("/rewards.get", { id: rewardId });
	expect(fetched.feature_grant?.id).toBe(rewardId);
	expect(fetched.feature_grant?.grants[0].included).toBe(100);
	expect(fetched.coupon).toBeUndefined();

	// --- rewards.update (partial: name only, grants preserved) ---
	const renamed = await rpc.post("/rewards.update", {
		id: rewardId,
		feature_grant: { name: "Renamed Grant" },
	});
	expect(renamed.feature_grant?.name).toBe("Renamed Grant");
	expect(renamed.feature_grant?.grants[0].included).toBe(100);

	// --- rewards.update (grants replaced) ---
	const regranted = await rpc.post("/rewards.update", {
		id: rewardId,
		feature_grant: {
			grants: [
				{ feature_id: messagesFeature!.id, included: 250, expiry: null },
			],
		},
	});
	expect(regranted.feature_grant?.grants[0].included).toBe(250);
	expect(regranted.feature_grant?.name).toBe("Renamed Grant");

	// --- referral_programs.create ---
	const created = await rpc.post("/referral_programs.create", {
		id: programId,
		reward_id: rewardId,
		redeem_on: RewardTriggerEvent.CustomerCreation,
		received_by: RewardReceivedBy.Referrer,
		max_redemptions: 5,
	});
	expect(created.id).toBe(programId);

	// --- referral_programs.get ---
	const gotProgram = await rpc.post("/referral_programs.get", {
		id: programId,
	});
	expect(gotProgram.reward_id).toBe(rewardId);
	expect(gotProgram.max_redemptions).toBe(5);

	// --- referral_programs.list ---
	const listed = await rpc.post("/referral_programs.list", {});
	expect(
		listed.referral_programs.some(
			(program: { id: string }) => program.id === programId,
		),
	).toBe(true);

	// --- referral_programs.update (partial) ---
	const updatedProgram = await rpc.post("/referral_programs.update", {
		id: programId,
		received_by: RewardReceivedBy.All,
	});
	expect(updatedProgram.received_by).toBe(RewardReceivedBy.All);
	expect(updatedProgram.max_redemptions).toBe(5);
	expect(updatedProgram.reward_id).toBe(rewardId);

	// --- rewards.delete is blocked while a program links the reward ---
	await expect(rpc.post("/rewards.delete", { id: rewardId })).rejects.toThrow();

	// --- referral_programs.delete ---
	const deletedProgram = await rpc.post("/referral_programs.delete", {
		id: programId,
	});
	expect(deletedProgram).toEqual({ id: programId, deleted: true });

	await expect(
		rpc.post("/referral_programs.get", { id: programId }),
	).rejects.toThrow();

	// --- rewards.delete now succeeds ---
	const deletedReward = await rpc.post("/rewards.delete", { id: rewardId });
	expect(deletedReward).toEqual({ id: rewardId, deleted: true });

	await expect(rpc.post("/rewards.get", { id: rewardId })).rejects.toThrow();
});
