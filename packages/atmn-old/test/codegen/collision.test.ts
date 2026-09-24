import { describe, expect, test } from "bun:test";
import { referralProgram, reward } from "../../src/compose/index.js";
import { buildConfigFile } from "../../src/lib/transforms/sdkToCode/configFile.js";
import { resolveVarNames } from "../../src/lib/transforms/sdkToCode/helpers.js";

describe("var name collision handling", () => {
	test("resolveVarNames: no collision — both names are clean", () => {
		const { featureVarMap, planVarMap } = resolveVarNames(
			["api_calls"],
			["pro"],
		);
		expect(featureVarMap.get("api_calls")).toBe("apiCalls");
		expect(planVarMap.get("pro")).toBe("pro");
	});

	test("resolveVarNames: collision — plan gets _plan suffix", () => {
		const { featureVarMap, planVarMap } = resolveVarNames(["free"], ["free"]);
		expect(featureVarMap.get("free")).toBe("free");
		expect(planVarMap.get("free")).toBe("freePlan");
	});

	test("resolveVarNames: collision with hyphenated ids", () => {
		const { featureVarMap, planVarMap } = resolveVarNames(
			["my-feature"],
			["my-feature"],
		);
		// Both sanitize to "myFeature"
		expect(featureVarMap.get("my-feature")).toBe("myFeature");
		expect(planVarMap.get("my-feature")).toBe("myFeaturePlan");
	});

	test("resolveVarNames: multiple plans, only colliding one gets suffix", () => {
		const { featureVarMap, planVarMap } = resolveVarNames(
			["domains"],
			["domains", "pro"],
		);
		expect(featureVarMap.get("domains")).toBe("domains");
		expect(planVarMap.get("domains")).toBe("domainsPlan");
		expect(planVarMap.get("pro")).toBe("pro");
	});

	test("buildConfigFile: no duplicate export const when feature and plan share id", () => {
		const features = [{ id: "free", name: "Free", type: "boolean" as const }];
		const plans = [
			{
				id: "free",
				name: "Free",
				items: [],
			},
		];

		const code = buildConfigFile(features, plans);

		// Count occurrences of each declaration
		const featureDecls = (code.match(/export const free\b/g) ?? []).length;
		const planDecls = (code.match(/export const freePlan\b/g) ?? []).length;

		expect(featureDecls).toBe(1);
		expect(planDecls).toBe(1);
		// Crucially: no two `export const free =` declarations
		expect(code).not.toMatch(
			/export const free = feature[\s\S]*export const free = plan/,
		);
	});

	test("buildConfigFile: non-colliding ids are unchanged", () => {
		const features = [
			{
				id: "api_calls",
				name: "API Calls",
				type: "metered" as const,
				consumable: true,
			},
		];
		const plans = [{ id: "pro", name: "Pro", items: [] }];

		const code = buildConfigFile(features, plans);

		expect(code).toContain("export const apiCalls = feature(");
		expect(code).toContain("export const pro = plan(");
	});

	test("buildConfigFile: rewards and referral programs avoid every generated export", () => {
		const bonus = reward({
			id: "credits",
			name: "Credits",
			type: "feature_grant",
			grants: [{ featureId: "credits", included: 1 }],
			promoCodes: [{ code: "CREDITS" }],
		});
		const refer = referralProgram({
			id: "invite",
			rewardId: bonus.id,
			redeemOn: "checkout",
			receivedBy: "all",
		});
		const code = buildConfigFile(
			[
				{ id: "reward-credits", name: "Credits", type: "boolean" },
				{
					id: "referral-program-invite",
					name: "Invite",
					type: "boolean",
				},
			],
			[],
			[bonus],
			[refer],
		);
		const exports = [...code.matchAll(/export const (\w+)/g)].map(
			([, varName]) => varName,
		);

		expect(code).toContain("export const rewardCreditsReward = reward(");
		expect(code).toContain(
			"export const referralProgramInviteReferralProgram = referralProgram(",
		);
		expect(new Set(exports).size).toBe(exports.length);
	});
});
