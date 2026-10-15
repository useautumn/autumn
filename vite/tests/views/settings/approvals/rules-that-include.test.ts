/**
 * Contract: a role or member view lists the approval rules whose subjects
 * include it (directly, through the member's role, or through Everyone),
 * and says how each one includes it.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalRule, RuleSubject } from "@autumn/shared";
import {
	type IncludedVia,
	includedViaText,
	type RuleAudience,
	rulesThatInclude,
} from "@/views/settings/sections/approvals/rulesThatInclude";

const sales: RuleSubject = { type: "role", role: "sales" };
const engineering: RuleSubject = { type: "role", role: "engineering" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };
const maya: RuleSubject = { type: "user", user_id: "usr_maya" };

const rule = ({
	id,
	subjects,
}: {
	id: string;
	subjects: RuleSubject[];
}): ApprovalRule => ({
	id,
	name: id,
	subjects,
	actions: ["billing.attach"],
	when: null,
	note: null,
	enabled: true,
	version: 1,
	updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
});

const RULES = [
	rule({ id: "sales_trials", subjects: [sales, engineering, john] }),
	rule({ id: "eng_credits", subjects: [engineering] }),
	rule({ id: "john_credits", subjects: [john] }),
	rule({ id: "maya_only", subjects: [maya] }),
	rule({ id: "everyone_cancel", subjects: [everyone] }),
];

const johnInEngineering: RuleAudience = {
	type: "user",
	userId: "usr_john",
	role: "engineering",
};

describe("rules that include", () => {
	test.each<[string, RuleAudience, [string, IncludedVia[]][]]>([
		[
			"a role: its own rules, then Everyone's",
			{ type: "role", role: "sales" },
			[
				["sales_trials", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a role named in several rules",
			{ type: "role", role: "engineering" },
			[
				["sales_trials", ["direct"]],
				["eng_credits", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a role no rule names still gets Everyone's",
			{ type: "role", role: "finance" },
			[["everyone_cancel", ["everyone"]]],
		],
		[
			"a member: named directly, through their role, and through Everyone",
			johnInEngineering,
			[
				["sales_trials", ["direct", "role"]],
				["eng_credits", ["role"]],
				["john_credits", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a member with no role",
			{ type: "user", userId: "usr_maya", role: null },
			[
				["maya_only", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a member no rule names directly",
			{ type: "user", userId: "usr_tom", role: "sales" },
			[
				["sales_trials", ["role"]],
				["everyone_cancel", ["everyone"]],
			],
		],
	])("%s", (_name, audience, expected) => {
		expect(
			rulesThatInclude({ rules: RULES, audience }).map(({ rule, via }) => [
				rule.id,
				via,
			]),
		).toEqual(expected);
	});

	test("no rules, nothing included", () => {
		expect(
			rulesThatInclude({ rules: [], audience: johnInEngineering }),
		).toEqual([]);
	});
});

describe("included via text", () => {
	test.each<[Parameters<typeof includedViaText>[0], string]>([
		[
			{ name: "John", roleLabel: "Engineering", via: ["direct", "role"] },
			"includes John directly and via Engineering",
		],
		[
			{ name: "John", roleLabel: "Engineering", via: ["role"] },
			"includes John via Engineering",
		],
		[
			{ name: "Sales", roleLabel: null, via: ["everyone"] },
			"includes Sales via Everyone",
		],
		[
			{ name: "Sales", roleLabel: null, via: ["direct"] },
			"includes Sales directly",
		],
		[
			{
				name: "John",
				roleLabel: "Engineering",
				via: ["direct", "role", "everyone"],
			},
			"includes John directly, via Engineering and via Everyone",
		],
	])("%j", (params, expected) => {
		expect(includedViaText(params)).toBe(expected);
	});
});
