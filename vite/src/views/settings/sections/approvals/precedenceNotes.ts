import type {
	ApprovalAction,
	ApprovalRule,
	ApprovalRuleEffect,
	RuleSubject,
} from "@autumn/shared";
import {
	type IncludedVia,
	joinWithAnd,
	type RuleAudience,
	rulesThatInclude,
} from "./rulesThatInclude";

/** The rule fields precedence reads. */
export type PrecedenceRule = Pick<
	ApprovalRule,
	"id" | "name" | "effect" | "position" | "subjects" | "actions" | "enabled"
>;

/** The rule in the editor: `id` and `position` are null until it's saved, so it sits last. */
export type PrecedenceDraft = Pick<
	PrecedenceRule,
	"effect" | "subjects" | "actions" | "enabled"
> & { id: string | null; position: number | null };

type BroaderSubject = Exclude<RuleSubject, { type: "user" }>;
type RuleRef = Pick<PrecedenceRule, "id" | "name" | "effect">;

export type PrecedenceNote =
	| {
			kind: "beats_broader";
			subject: Exclude<RuleSubject, { type: "everyone" }>;
			broader: BroaderSubject;
			rules: RuleRef[];
			/** Some of those rules also name these people more specifically, and decide for them. */
			namesNarrower?: true;
			actions: ApprovalAction[];
	  }
	| {
			kind: "same_level_order";
			subject: RuleSubject;
			other: RuleRef & Pick<PrecedenceRule, "position">;
			winner: "draft" | "other";
			/** The other rule also names some of these people more specifically, and decides for them. */
			namesNarrower?: true;
			actions: ApprovalAction[];
	  };

type Level = { via: IncludedVia; subject: BroaderSubject };

const SPECIFICITY: Record<RuleSubject["type"], number> = {
	user: 0,
	role: 1,
	everyone: 2,
};

const namesNarrowerThan = ({
	rule,
	subject,
}: {
	rule: PrecedenceRule;
	subject: RuleSubject;
}) =>
	rule.subjects.some(
		({ type }) => SPECIFICITY[type] < SPECIFICITY[subject.type],
	);

/** The audience a draft subject stands for, and the levels broader than it. */
const subjectScope = ({
	subject,
	roleOf,
}: {
	subject: RuleSubject;
	roleOf: (userId: string) => string | null;
}): { audience: RuleAudience | null; broader: Level[] } => {
	const everyone: Level = { via: "everyone", subject: { type: "everyone" } };
	if (subject.type === "everyone") return { audience: null, broader: [] };
	if (subject.type === "role") {
		return {
			audience: { type: "role", roleId: subject.role_id },
			broader: [everyone],
		};
	}
	const roleId = roleOf(subject.user_id);
	const role: Level[] = roleId
		? [{ via: "role", subject: { type: "role", role_id: roleId } }]
		: [];
	return {
		audience: { type: "user", userId: subject.user_id, roleId },
		broader: [...role, everyone],
	};
};

const ruleRef = ({ id, name, effect }: RuleRef): RuleRef => ({
	id,
	name,
	effect,
});

/**
 * Where this rule and an opposite-effect rule both cover an action for the same
 * people: the narrower level wins when both match, and within a level the later rule.
 */
export const precedenceNotes = ({
	draft,
	rules,
	roleOf,
}: {
	draft: PrecedenceDraft;
	rules: PrecedenceRule[];
	roleOf: (userId: string) => string | null;
}): PrecedenceNote[] => {
	if (!draft.enabled) return [];
	const opposing = rules.filter(
		(rule) =>
			rule.enabled && rule.id !== draft.id && rule.effect !== draft.effect,
	);
	const sharedActions = (rule: PrecedenceRule) => {
		const covered = new Set(rule.actions);
		return draft.actions.filter((action) => covered.has(action));
	};

	return draft.subjects.flatMap((subject): PrecedenceNote[] => {
		const { audience, broader } = subjectScope({ subject, roleOf });
		const included = audience
			? rulesThatInclude({ rules: opposing, audience })
			: opposing
					.filter((rule) =>
						rule.subjects.some(({ type }) => type === "everyone"),
					)
					.map((rule) => ({ rule, via: ["direct" as IncludedVia] }));
		const atLevel = (via: IncludedVia) =>
			included
				.filter((item) => item.via[0] === via)
				.map(({ rule }) => ({ rule, actions: sharedActions(rule) }))
				.filter(({ actions }) => actions.length > 0);

		const sameLevel = atLevel("direct").map(
			({ rule, actions }): PrecedenceNote => ({
				kind: "same_level_order",
				subject,
				other: { ...ruleRef(rule), position: rule.position },
				winner:
					draft.position === null || draft.position > rule.position
						? "draft"
						: "other",
				...(namesNarrowerThan({ rule, subject }) && {
					namesNarrower: true as const,
				}),
				actions,
			}),
		);
		if (subject.type === "everyone") return sameLevel;

		const broaderNotes = broader.flatMap((level): PrecedenceNote[] => {
			const hits = atLevel(level.via);
			if (hits.length === 0) return [];
			const hitActions = new Set(hits.flatMap(({ actions }) => actions));
			return [
				{
					kind: "beats_broader",
					subject,
					broader: level.subject,
					rules: hits.map(({ rule }) => ruleRef(rule)),
					...(hits.some(({ rule }) => namesNarrowerThan({ rule, subject })) && {
						namesNarrower: true as const,
					}),
					actions: draft.actions.filter((action) => hitActions.has(action)),
				},
			];
		});
		return [...sameLevel, ...broaderNotes];
	});
};

const EFFECT_WORDS: Record<ApprovalRuleEffect, string> = {
	allow: "allow",
	block: "block",
};

export const precedenceNoteText = ({
	note,
	nameOf,
	actionLabel,
}: {
	note: PrecedenceNote;
	nameOf: (subject: RuleSubject) => string;
	actionLabel: (action: ApprovalAction) => string;
}) => {
	const actions = joinWithAnd(note.actions.map(actionLabel));
	if (note.kind === "same_level_order") {
		if (note.winner === "other") {
			return `“${note.other.name}” comes later in the list, so it wins when both match (${actions}).`;
		}
		const exception = note.namesNarrower
			? `, except for anyone “${note.other.name}” names more specifically`
			: "";
		return `Comes after “${note.other.name}”, so this rule wins when both match (${actions})${exception}.`;
	}
	const plural = note.rules.length === 1 ? "rule" : "rules";
	const effect = EFFECT_WORDS[note.rules[0].effect];
	const exception = note.namesNarrower
		? `, except for anyone that ${plural === "rule" ? "rule names" : "rules name"} more specifically`
		: "";
	return `When both match, this rule beats ${nameOf(note.broader)}'s ${effect} ${plural} for ${nameOf(note.subject)} on ${actions}${exception}.`;
};
