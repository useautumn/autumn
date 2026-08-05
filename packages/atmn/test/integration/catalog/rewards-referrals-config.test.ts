import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import {
	initScenario,
	s,
} from "../../../../../server/tests/utils/testInitUtils/initScenario.js";
import {
	createCleanAtmnIntegrationContext,
	prepareAtmnIntegrationWorkspace,
	runAtmnWorkspaceCli,
} from "../utils/atmnTestWorkspace.js";

test("atmn pushes, redeems, pulls, and re-pushes reward config", async () => {
	if (process.env.AUTUMN_TEST_BASE_URL) {
		process.env.ATMN_BACKEND_URL = process.env.AUTUMN_TEST_BASE_URL;
	}
	const suffix = Date.now();
	const featureId = `atmn_referral_credits_${suffix}`;
	const rewardId = `atmn_referral_reward_${suffix}`;
	const programId = `atmn_referral_program_${suffix}`;
	const referrerId = `atmn_referrer_${suffix}`;
	const referredId = `atmn_referred_${suffix}`;
	const included = 250;
	const ctx = await createCleanAtmnIntegrationContext();
	const workspace = await prepareAtmnIntegrationWorkspace({
		secretKey: ctx.orgSecretKey,
	});
	await writeFile(
		workspace.configPath,
		`import { feature, referralProgram, reward } from 'atmn';

export const credits = feature({ id: '${featureId}', name: 'Referral credits', type: 'metered', consumable: true });
export const referralReward = reward({
	id: '${rewardId}', name: 'Referral reward', type: 'feature_grant',
	grants: [{ featureId: credits.id, included: ${included} }],
	promoCodes: [{ code: 'REFER${suffix}', maxUses: 100 }],
});
export const referrals = referralProgram({
	id: '${programId}', rewardId: referralReward.id,
	redeemOn: 'customer_creation', receivedBy: 'all', maxRedemptions: 5,
});
`,
	);
	const push = () =>
		runAtmnWorkspaceCli({
			args: ["--yes"],
			command: "push",
			headless: true,
			workspace,
		});

	await push();
	await push();
	const { autumnV1 } = await initScenario({
		ctx,
		customerId: referrerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: referredId, paymentMethod: "success" }]),
		],
		actions: [],
	});
	const { code } = await autumnV1.referrals.createCode({
		customerId: referrerId,
		referralId: programId,
	});
	await autumnV1.referrals.redeem({ customerId: referredId, code });
	for (const customerId of [referrerId, referredId]) {
		const { balance } = await autumnV1.check({
			customer_id: customerId,
			feature_id: featureId,
		});
		expect(balance).toBe(included);
	}

	await runAtmnWorkspaceCli({
		args: ["--force", "--no-declaration-file"],
		command: "pull",
		headless: true,
		workspace,
	});
	const pulled = await readFile(workspace.configPath, "utf8");
	expect(pulled).toContain("reward(");
	expect(pulled).toContain("referralProgram(");
	await push();
});
