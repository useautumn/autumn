import { expect, test } from "bun:test";
import { mergeEnvironments } from "../../src/commands/pull/mergeEnvironments.js";
import type { EnvironmentData } from "../../src/commands/pull/types.js";
import type {
	Feature,
	ReferralProgram,
	Reward,
} from "../../src/compose/index.js";
import type { Plan } from "../../src/compose/models/variantModels.js";

const feature = (id: string): Feature => ({ id, name: id, type: "boolean" });
const plan = (id: string): Plan => ({ id, name: id });
const reward = (id: string): Reward => ({
	id,
	name: id,
	type: "feature_grant",
	grants: [],
	promoCodes: [],
});
const referralProgram = (id: string): ReferralProgram => ({
	id,
	rewardId: "reward",
	redeemOn: "customer_creation",
	receivedBy: "all",
});

test("merges every resource sandbox-first", () => {
	const sandbox: EnvironmentData = {
		features: [feature("shared"), feature("sandbox")],
		plans: [plan("shared"), { ...plan("versioned"), version: 1 }],
		rewards: [reward("shared"), reward("sandbox")],
		referralPrograms: [referralProgram("shared"), referralProgram("sandbox")],
	};
	const production: EnvironmentData = {
		features: [feature("shared"), feature("production")],
		plans: [plan("shared"), { ...plan("versioned"), version: 2 }],
		rewards: [reward("shared"), reward("production")],
		referralPrograms: [
			referralProgram("shared"),
			referralProgram("production"),
		],
	};

	const merged = mergeEnvironments({ sandbox, production });

	expect(merged).toEqual({
		features: [...sandbox.features, production.features[1]],
		plans: [...sandbox.plans, production.plans[1]],
		rewards: [...sandbox.rewards, production.rewards[1]],
		referralPrograms: [
			...sandbox.referralPrograms,
			production.referralPrograms[1],
		],
	});
	expect(merged.features[0]).toBe(sandbox.features[0]);
	expect(merged.plans[0]).toBe(sandbox.plans[0]);
	expect(merged.rewards[0]).toBe(sandbox.rewards[0]);
	expect(merged.referralPrograms[0]).toBe(sandbox.referralPrograms[0]);
});
