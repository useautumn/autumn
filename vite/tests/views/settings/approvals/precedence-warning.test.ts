/**
 * Contract: when a rule names a member directly for an action, and their role
 * (or Everyone) also has rules for that action, the editor warns that those
 * rules no longer apply to them. Precedence is user, then role, then everyone.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction, ApprovalRule, RuleSubject } from "@autumn/shared";
import {
	type PrecedenceDraft,
	type PrecedenceWarning,
	precedenceWarnings,
	precedenceWarningText,
} from "@/views/settings/sections/approvals/precedenceWarnings";

const engineering: RuleSubject = { type: "role", role: "engineering" };
const sales: RuleSubject = { type: "role", role: "sales" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };

const ROLES: Record<string, string> = {
	usr_john: "engineering",
	usr_maya: "sales",
};
const roleOf = (userId: string) => ROLES[userId] ?? null;

const rule = ({
	id,
	subjects,
	actions = ["balances.create"],
	enabled = true,
}: {
	id: string;
	subjects: RuleSubject[];
	actions?: ApprovalAction[];
	enabled?: boolean;
}): ApprovalRule => ({
	id,
	name: id,
	subjects,
	actions,
	when: null,
	note: null,
	enabled,
	version: 1,
	updated_by: { user_id: "usr_charlie", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
});

const johnGrants: PrecedenceDraft = {
	id: null,
	subjects: [john],
	actions: ["balances.create"],
	enabled: true,
};
const engGrants = rule({ id: "eng_grants", subjects: [engineering] });

describe("precedence warnings", () => {
	test.each<[string, PrecedenceDraft, ApprovalRule[], PrecedenceWarning[]]>([
		[
			"case 4: John named directly, Engineering also grants credits",
			johnGrants,
			[engGrants],
			[
				{
					userId: "usr_john",
					overridden: engineering,
					actions: ["balances.create"],
				},
			],
		],
		[
			"Everyone's rule for the same action is overridden too",
			johnGrants,
			[rule({ id: "all_grants", subjects: [everyone] })],
			[
				{
					userId: "usr_john",
					overridden: everyone,
					actions: ["balances.create"],
				},
			],
		],
		[
			"overlapping actions collect into one warning, in the draft's order",
			{ ...johnGrants, actions: ["balances.create", "balances.update"] },
			[
				rule({
					id: "eng_set",
					subjects: [engineering],
					actions: ["balances.update"],
				}),
				engGrants,
			],
			[
				{
					userId: "usr_john",
					overridden: engineering,
					actions: ["balances.create", "balances.update"],
				},
			],
		],
		[
			"the stored copy of the rule being edited doesn't count",
			{ ...johnGrants, id: "john_grants", subjects: [john, engineering] },
			[rule({ id: "john_grants", subjects: [engineering] })],
			[],
		],
		[
			"no overlapping action",
			johnGrants,
			[
				rule({
					id: "eng_set",
					subjects: [engineering],
					actions: ["balances.update"],
				}),
			],
			[],
		],
		[
			"another role's rule",
			johnGrants,
			[rule({ id: "sales_grants", subjects: [sales] })],
			[],
		],
		[
			"the role's rule is disabled",
			johnGrants,
			[rule({ id: "eng_off", subjects: [engineering], enabled: false })],
			[],
		],
		[
			"the draft is disabled",
			{ ...johnGrants, enabled: false },
			[engGrants],
			[],
		],
		[
			"the other rule names John too, so it still applies",
			johnGrants,
			[rule({ id: "both", subjects: [engineering, john] })],
			[],
		],
		[
			"the draft names a role, not a member",
			{ ...johnGrants, subjects: [engineering] },
			[rule({ id: "all_grants", subjects: [everyone] })],
			[],
		],
		[
			"a member with no role and no Everyone rule",
			{ ...johnGrants, subjects: [{ type: "user", user_id: "usr_new" }] },
			[engGrants],
			[],
		],
	])("%s", (_name, draft, rules, expected) => {
		expect(precedenceWarnings({ draft, rules, roleOf })).toEqual(expected);
	});
});

describe("precedence warning text", () => {
	test.each<[Parameters<typeof precedenceWarningText>[0], string]>([
		[
			{
				userName: "John",
				overriddenName: "Engineering",
				actionLabels: ["Grant credits"],
			},
			"John is named directly, so Engineering's rules no longer apply to them for Grant credits.",
		],
		[
			{
				userName: "John",
				overriddenName: "Everyone",
				actionLabels: ["Grant credits", "Set balance"],
			},
			"John is named directly, so Everyone's rules no longer apply to them for Grant credits and Set balance.",
		],
	])("%j", (params, expected) => {
		expect(precedenceWarningText(params)).toBe(expected);
	});
});
