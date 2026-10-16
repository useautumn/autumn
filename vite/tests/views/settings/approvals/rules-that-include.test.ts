/**
 * Contract: a role or member view lists the approval rules whose subjects
 * include it (directly, through the member's role, or through Everyone),
 * most specific level first and in list order within a level.
 */

import { describe, expect, test } from "bun:test";
import type { RuleSubject } from "@autumn/shared";
import type { PrecedenceRule } from "@/views/settings/sections/approvals/precedenceNotes";
import {
	type IncludedVia,
	includedViaText,
	type RuleAudience,
	rulesThatInclude,
} from "@/views/settings/sections/approvals/rulesThatInclude";

const sales: RuleSubject = { type: "role", role_id: "sales" };
const engineering: RuleSubject = { type: "role", role_id: "engineering" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };
const maya: RuleSubject = { type: "user", user_id: "usr_maya" };

const rule = ({
	id,
	subjects,
	position,
}: {
	id: string;
	subjects: RuleSubject[];
	position: number;
}): PrecedenceRule => ({
	id,
	name: id,
	effect: "allow",
	position,
	subjects,
	actions: ["billing.attach"],
	enabled: true,
});

const RULES = [
	rule({
		id: "sales_trials",
		subjects: [sales, engineering, john],
		position: 0,
	}),
	rule({ id: "eng_credits", subjects: [engineering], position: 1 }),
	rule({ id: "john_credits", subjects: [john], position: 2 }),
	rule({ id: "maya_only", subjects: [maya], position: 3 }),
	rule({ id: "everyone_cancel", subjects: [everyone], position: 4 }),
];

const johnInEngineering: RuleAudience = {
	type: "user",
	userId: "usr_john",
	roleId: "engineering",
};

describe("rules that include", () => {
	test.each<[string, RuleAudience, [string, IncludedVia[]][]]>([
		[
			"a role: its own rules, then Everyone's",
			{ type: "role", roleId: "sales" },
			[
				["sales_trials", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a role named in several rules",
			{ type: "role", roleId: "engineering" },
			[
				["sales_trials", ["direct"]],
				["eng_credits", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a role no rule names still gets Everyone's",
			{ type: "role", roleId: "finance" },
			[["everyone_cancel", ["everyone"]]],
		],
		[
			"a member: named directly, through their role, and through Everyone",
			johnInEngineering,
			[
				["sales_trials", ["direct", "role"]],
				["john_credits", ["direct"]],
				["eng_credits", ["role"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"a member with no role",
			{ type: "user", userId: "usr_maya", roleId: null },
			[
				["maya_only", ["direct"]],
				["everyone_cancel", ["everyone"]],
			],
		],
		[
			"an owner is included like anyone else",
			{ type: "user", userId: "usr_tom", roleId: "owner" },
			[["everyone_cancel", ["everyone"]]],
		],
	])("%s", (_name, audience, expected) => {
		expect(
			rulesThatInclude({ rules: RULES, audience }).map(({ rule, via }) => [
				rule.id,
				via,
			]),
		).toEqual(expected);
	});

	test("within a level, rules keep list order", () => {
		const rules = [
			rule({ id: "later", subjects: [sales], position: 5 }),
			rule({ id: "earlier", subjects: [sales], position: 2 }),
		];
		expect(
			rulesThatInclude({
				rules,
				audience: { type: "role", roleId: "sales" },
			}).map(({ rule }) => rule.id),
		).toEqual(["earlier", "later"]);
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
			{ name: "John", roleName: "Engineering", via: ["direct", "role"] },
			"includes John directly and via Engineering",
		],
		[
			{ name: "John", roleName: "Engineering", via: ["role"] },
			"includes John via Engineering",
		],
		[
			{ name: "Sales", roleName: null, via: ["everyone"] },
			"includes Sales via Everyone",
		],
		[
			{
				name: "John",
				roleName: "Engineering",
				via: ["direct", "role", "everyone"],
			},
			"includes John directly, via Engineering and via Everyone",
		],
	])("%j", (params, expected) => {
		expect(includedViaText(params)).toBe(expected);
	});
});
