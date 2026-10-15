/**
 * S4 contract (api-schema §4 case 4): John's user-level Grant credits rule
 * decides for him even where Engineering's role rule would allow.
 *
 * Red (before):  `evaluateApprovalRules` doesn't exist.
 * Green (after): the walkthrough's verdicts, violations and allowed roles.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, evaluateApprovalRules } from "@autumn/shared";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { principals, storedRule } from "./utils/principals.js";

const john = principals.user({ role: "engineering", userId: "usr_john" });
const otherEngineer = principals.user({
	role: "engineering",
	userId: "usr_ann",
});

const caseFour = [
	storedRule({
		id: "apr_john",
		rule: {
			...rules.creditGrants({
				maxGrant: 50,
				subjects: [{ type: "user", user_id: "usr_john" }],
			}),
			name: "John's credit grants",
			note: "John can grant up to 50 AI credits. Ask an Admin for more.",
		},
	}),
	storedRule({
		id: "apr_engineering",
		rule: {
			...rules.creditGrants({
				maxGrant: 500,
				subjects: [{ type: "role", role: "engineering" }],
			}),
			name: "Engineering credit grants",
		},
	}),
];

const grant = ({
	principal,
	featureId = "ai_credits",
	amount,
}: {
	principal: typeof john;
	featureId?: string;
	amount: number;
}) =>
	evaluateApprovalRules({
		principal,
		action: "balances.create",
		facts: facts.balanceCreate({
			feature_id: featureId,
			included_grant: amount,
		}),
		rules: caseFour,
		env: AppEnv.Live,
	});

describe("evaluateApprovalRules: case 4, a tighter limit for one person", () => {
	test("John granting 200 AI credits is denied at the user level; Engineering is an allowed role", () => {
		expect(grant({ principal: john, amount: 200 })).toEqual({
			verdict: "deny",
			violations: [
				{
					field: "included_grant",
					label: "Amount",
					limit: "≤ 50",
					actual: "200",
				},
			],
			decided_by: {
				level: "user",
				rule_id: "apr_john",
				rule_name: "John's credit grants",
			},
			allowed_roles: ["owner", "admin", "engineering"],
			message: "John can grant up to 50 AI credits. Ask an Admin for more.",
		});
	});

	test("John granting another feature is still decided (and denied) at the user level", () => {
		expect(
			grant({ principal: john, featureId: "messages", amount: 10 }),
		).toMatchObject({
			verdict: "deny",
			violations: [
				{
					field: "feature_id",
					label: "Feature",
					limit: "ai_credits",
					actual: "messages",
				},
			],
			decided_by: { level: "user", rule_id: "apr_john" },
			allowed_roles: ["owner", "admin"],
		});
	});

	test("John within his cap, and another engineer at 200, are allowed", () => {
		expect(grant({ principal: john, amount: 50 })).toMatchObject({
			verdict: "allow",
			decided_by: { level: "user", rule_id: "apr_john" },
		});
		expect(grant({ principal: otherEngineer, amount: 200 })).toMatchObject({
			verdict: "allow",
			decided_by: { level: "role", rule_id: "apr_engineering" },
		});
	});
});
