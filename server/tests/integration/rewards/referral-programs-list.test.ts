import { expect, test } from "bun:test";
import {
	RewardReceivedBy,
	RewardTriggerEvent,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test("referral_programs.list omits orphan programs", async () => {
	const suffix = Date.now();
	const { autumnV2_2, ctx } = await initScenario({
		customerId: `orphan-referral-program-${suffix}`,
		setup: [s.platform.create({ setupDefaultFeatures: true })],
		actions: [],
	});
	const rewardInternalId = `rew_${suffix}`;
	const rewardId = `valid-reward-${suffix}`;
	const validProgramId = `valid-program-${suffix}`;
	await ctx.db.insert(rewards).values({
		internal_id: rewardInternalId,
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
	});
	await ctx.db.insert(rewardPrograms).values([
		{
			internal_id: `rs_valid_${suffix}`,
			id: validProgramId,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: Date.now(),
			internal_reward_id: rewardInternalId,
			when: RewardTriggerEvent.CustomerCreation,
			received_by: RewardReceivedBy.Referrer,
		},
		{
			internal_id: `rs_orphan_${suffix}`,
			id: `orphan-program-${suffix}`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: Date.now(),
			internal_reward_id: null,
			when: RewardTriggerEvent.CustomerCreation,
			received_by: RewardReceivedBy.Referrer,
		},
	]);

	const result = await autumnV2_2.post("/referral_programs.list", {});
	expect(result.referral_programs).toEqual([
		expect.objectContaining({ id: validProgramId, reward_id: rewardId }),
	]);
});
