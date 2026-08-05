import { describe, expect, test } from "bun:test";
import { referralProgram, reward } from "../../src/compose/index.js";
import { buildCatalogUpdateParams } from "../../src/commands/push/push.js";
import { buildConfigFile } from "../../src/lib/transforms/sdkToCode/configFile.js";

describe("reward config", () => {
	const grant = reward({
		id: "referral-credits",
		name: "Referral credits",
		type: "feature_grant",
		grants: [{ featureId: "credits", included: 300 }],
		promoCodes: [{ code: "REFER", maxUses: 100 }],
	});
	const program = referralProgram({
		id: "refer-a-friend",
		rewardId: grant.id,
		redeemOn: "customer_creation",
		receivedBy: "all",
		maxRedemptions: 5,
	});

	test("maps the camelCase DSL to catalog API params", () => {
		const params = buildCatalogUpdateParams({
			features: [],
			plans: [],
			rewards: [grant],
			referralPrograms: [program],
		});

		expect(params.rewards).toEqual([
			{
				feature_grant: {
					id: grant.id,
					name: grant.name,
					grants: [{ feature_id: "credits", included: 300, expiry: null }],
					promo_codes: [{ code: "REFER", max_uses: 100 }],
				},
			},
		]);
		expect(params.referral_programs?.[0]).toMatchObject({
			id: program.id,
			reward_id: grant.id,
		});
	});

	test("generates a loadable TypeScript config shape", () => {
		const code = buildConfigFile([], [], [grant], [program]);
		expect(code).toContain("reward(");
		expect(code).toContain("referralProgram(");
		expect(code).toContain("featureId: 'credits'");
	});
});
