import { expect, test } from "bun:test";
import {
	RewardReceivedBy,
	RewardTriggerEvent,
	rewardPrograms,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test("referral_programs.list rejects orphan programs", async () => {
	const suffix = Date.now();
	const { autumnV2_2, ctx } = await initScenario({
		customerId: `orphan-referral-program-${suffix}`,
		setup: [s.platform.create({ setupDefaultFeatures: true })],
		actions: [],
	});
	await ctx.db.insert(rewardPrograms).values({
		internal_id: `rs_${suffix}`,
		id: `orphan-program-${suffix}`,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		internal_reward_id: null,
		when: RewardTriggerEvent.CustomerCreation,
		received_by: RewardReceivedBy.Referrer,
	});

	await expect(autumnV2_2.post("/referral_programs.list", {})).rejects.toThrow(
		"has no reward",
	);
});
