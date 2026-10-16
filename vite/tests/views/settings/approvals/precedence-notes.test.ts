/**
 * Contract: the editor notes where this rule and another enabled rule with the
 * opposite effect both cover an action for the same people. A narrower level
 * (user, then role, then Everyone) beats a broader one when both match; within
 * a level the later rule in the list wins. Owners and admins get notes too.
 */

import { describe, expect, test } from "bun:test";
import type { RuleSubject } from "@autumn/shared";
import {
	type PrecedenceDraft,
	type PrecedenceNote,
	type PrecedenceRule,
	precedenceNotes,
	precedenceNoteText,
} from "@/views/settings/sections/approvals/precedenceNotes";

const engineering: RuleSubject = { type: "role", role_id: "engineering" };
const sales: RuleSubject = { type: "role", role_id: "sales" };
const everyone: RuleSubject = { type: "everyone" };
const john: RuleSubject = { type: "user", user_id: "usr_john" };
const ada: RuleSubject = { type: "user", user_id: "usr_ada" };

const ROLES: Record<string, string> = {
	usr_john: "engineering",
	usr_ada: "admin",
};
const roleOf = (userId: string) => ROLES[userId] ?? null;

const rule = (
	overrides: Partial<PrecedenceRule> & Pick<PrecedenceRule, "id" | "subjects">,
): PrecedenceRule => ({
	name: overrides.id,
	effect: "block",
	position: 0,
	actions: ["balances.create"],
	enabled: true,
	...overrides,
});

const draft = (overrides: Partial<PrecedenceDraft> = {}): PrecedenceDraft => ({
	id: null,
	effect: "allow",
	position: null,
	subjects: [john],
	actions: ["balances.create"],
	enabled: true,
	...overrides,
});

const ref = (r: PrecedenceRule) => ({
	id: r.id,
	name: r.name,
	effect: r.effect,
});

const engBlock = rule({ id: "eng_block", subjects: [engineering] });
const allBlock = rule({ id: "all_block", subjects: [everyone] });

describe("precedence notes", () => {
	test.each<[string, PrecedenceDraft, PrecedenceRule[], PrecedenceNote[]]>([
		[
			"a member allow beats their role's block when both match",
			draft(),
			[engBlock],
			[
				{
					kind: "beats_broader",
					subject: john,
					broader: engineering,
					rules: [ref(engBlock)],
					actions: ["balances.create"],
				},
			],
		],
		[
			"a role rule beats Everyone's opposite rule",
			draft({ subjects: [sales] }),
			[allBlock],
			[
				{
					kind: "beats_broader",
					subject: sales,
					broader: everyone,
					rules: [ref(allBlock)],
					actions: ["balances.create"],
				},
			],
		],
		[
			"a member gets one note per broader level, role first",
			draft({ actions: ["balances.create", "balances.update"] }),
			[
				allBlock,
				rule({
					id: "eng_set",
					subjects: [engineering],
					actions: ["balances.update"],
				}),
				engBlock,
			],
			[
				{
					kind: "beats_broader",
					subject: john,
					broader: engineering,
					rules: [
						ref(
							rule({
								id: "eng_set",
								subjects: [engineering],
								actions: ["balances.update"],
							}),
						),
						ref(engBlock),
					],
					actions: ["balances.create", "balances.update"],
				},
				{
					kind: "beats_broader",
					subject: john,
					broader: everyone,
					rules: [ref(allBlock)],
					actions: ["balances.create"],
				},
			],
		],
		[
			"an admin named directly still gets notes",
			draft({ subjects: [ada] }),
			[allBlock],
			[
				{
					kind: "beats_broader",
					subject: ada,
					broader: everyone,
					rules: [ref(allBlock)],
					actions: ["balances.create"],
				},
			],
		],
		[
			"a new rule wins ties at its level",
			draft({ effect: "block", subjects: [sales] }),
			[
				rule({
					id: "sales_allow",
					effect: "allow",
					position: 3,
					subjects: [sales],
				}),
			],
			[
				{
					kind: "same_level_order",
					subject: sales,
					other: {
						id: "sales_allow",
						name: "sales_allow",
						effect: "allow",
						position: 3,
					},
					winner: "draft",
					actions: ["balances.create"],
				},
			],
		],
		[
			"an earlier rule loses to a later one at its level",
			draft({ effect: "block", position: 1, subjects: [sales] }),
			[
				rule({
					id: "sales_allow",
					effect: "allow",
					position: 4,
					subjects: [sales],
				}),
			],
			[
				{
					kind: "same_level_order",
					subject: sales,
					other: {
						id: "sales_allow",
						name: "sales_allow",
						effect: "allow",
						position: 4,
					},
					winner: "other",
					actions: ["balances.create"],
				},
			],
		],
		[
			"same effect at a broader level is not a note",
			draft(),
			[rule({ id: "eng_allow", effect: "allow", subjects: [engineering] })],
			[],
		],
		[
			"same effect at the same level is not a note",
			draft(),
			[rule({ id: "john_allow", effect: "allow", subjects: [john] })],
			[],
		],
		[
			"Everyone has nothing broader",
			draft({ subjects: [everyone] }),
			[engBlock],
			[],
		],
		[
			"the stored copy of the rule being edited doesn't count",
			draft({ id: "eng_block", subjects: [john] }),
			[engBlock],
			[],
		],
		[
			"no overlapping action",
			draft(),
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
			draft(),
			[rule({ id: "sales_block", subjects: [sales] })],
			[],
		],
		[
			"the other rule is disabled",
			draft(),
			[rule({ id: "eng_off", subjects: [engineering], enabled: false })],
			[],
		],
		["the draft is disabled", draft({ enabled: false }), [engBlock], []],
		[
			"a broader rule that also names the member sits at their level",
			draft(),
			[rule({ id: "both", subjects: [engineering, john], position: 2 })],
			[
				{
					kind: "same_level_order",
					subject: john,
					other: { id: "both", name: "both", effect: "block", position: 2 },
					winner: "draft",
					actions: ["balances.create"],
				},
			],
		],
		[
			"a tie on a role, where the other rule also names a member directly",
			draft({ subjects: [engineering] }),
			[rule({ id: "both", subjects: [engineering, john], position: 2 })],
			[
				{
					kind: "same_level_order",
					subject: engineering,
					other: { id: "both", name: "both", effect: "block", position: 2 },
					winner: "draft",
					namesNarrower: true,
					actions: ["balances.create"],
				},
			],
		],
		[
			"a role beats a broader rule that also names a member directly",
			draft({ subjects: [engineering] }),
			[rule({ id: "mixed", subjects: [everyone, john] })],
			[
				{
					kind: "beats_broader",
					subject: engineering,
					broader: everyone,
					rules: [{ id: "mixed", name: "mixed", effect: "block" }],
					namesNarrower: true,
					actions: ["balances.create"],
				},
			],
		],
	])("%s", (_name, d, rules, expected) => {
		expect(precedenceNotes({ draft: d, rules, roleOf })).toEqual(expected);
	});
});

const nameOf = (subject: RuleSubject) => {
	if (subject.type === "everyone") return "Everyone";
	if (subject.type === "role")
		return subject.role_id === "engineering" ? "Engineering" : "Sales";
	return "John Doe";
};

describe("precedence note text", () => {
	test.each<[PrecedenceNote, string]>([
		[
			{
				kind: "beats_broader",
				subject: john,
				broader: engineering,
				rules: [ref(engBlock)],
				actions: ["balances.create"],
			},
			"When both match, this rule beats Engineering's block rule for John Doe on Grant credits.",
		],
		[
			{
				kind: "beats_broader",
				subject: sales,
				broader: everyone,
				rules: [ref(allBlock)],
				namesNarrower: true,
				actions: ["balances.create"],
			},
			"When both match, this rule beats Everyone's block rule for Sales on Grant credits, except for anyone that rule names more specifically.",
		],
		[
			{
				kind: "beats_broader",
				subject: sales,
				broader: everyone,
				rules: [ref(allBlock), ref(rule({ id: "b2", subjects: [everyone] }))],
				actions: ["balances.create", "balances.update"],
			},
			"When both match, this rule beats Everyone's block rules for Sales on Grant credits and Set balance.",
		],
		[
			{
				kind: "same_level_order",
				subject: sales,
				other: { id: "x", name: "Sales trials", effect: "allow", position: 3 },
				winner: "draft",
				actions: ["balances.create"],
			},
			"Comes after “Sales trials”, so this rule wins when both match (Grant credits).",
		],
		[
			{
				kind: "same_level_order",
				subject: sales,
				other: { id: "x", name: "Sales trials", effect: "allow", position: 3 },
				winner: "draft",
				namesNarrower: true,
				actions: ["balances.create"],
			},
			"Comes after “Sales trials”, so this rule wins when both match (Grant credits), except for anyone “Sales trials” names more specifically.",
		],
		[
			{
				kind: "same_level_order",
				subject: sales,
				other: { id: "x", name: "Sales trials", effect: "allow", position: 3 },
				winner: "other",
				actions: ["balances.create"],
			},
			"“Sales trials” comes later in the list, so it wins when both match (Grant credits).",
		],
	])("%#", (note, expected) => {
		expect(
			precedenceNoteText({
				note,
				nameOf,
				actionLabel: (action) =>
					action === "balances.create" ? "Grant credits" : "Set balance",
			}),
		).toBe(expected);
	});
});
