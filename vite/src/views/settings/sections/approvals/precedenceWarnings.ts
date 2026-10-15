import type { ApprovalAction, ApprovalRule, RuleSubject } from "@autumn/shared";
import {
	type IncludedVia,
	joinWithAnd,
	rulesThatInclude,
} from "./rulesThatInclude";

/** The rule in the editor: `id` is null until it's saved. */
export type PrecedenceDraft = {
	id: string | null;
	subjects: RuleSubject[];
	actions: ApprovalAction[];
	enabled: boolean;
};

export type PrecedenceWarning = {
	userId: string;
	overridden: Exclude<RuleSubject, { type: "user" }>;
	actions: ApprovalAction[];
};

type Level = [IncludedVia, PrecedenceWarning["overridden"]];

/**
 * Naming a member decides at the user level, so their role's and Everyone's
 * rules for the same actions stop applying to them.
 */
export const precedenceWarnings = ({
	draft,
	rules,
	roleOf,
}: {
	draft: PrecedenceDraft;
	rules: ApprovalRule[];
	roleOf: (userId: string) => string | null;
}): PrecedenceWarning[] => {
	if (!draft.enabled) return [];
	const others = rules.filter((rule) => rule.enabled && rule.id !== draft.id);

	return draft.subjects.flatMap((subject) => {
		if (subject.type !== "user") return [];
		const userId = subject.user_id;
		const role = roleOf(userId);
		// A rule that also names the member still decides for them.
		const broader = rulesThatInclude({
			rules: others,
			audience: { type: "user", userId, role },
		}).filter(({ via }) => !via.includes("direct"));
		const everyoneLevel: Level = ["everyone", { type: "everyone" }];
		const levels: Level[] = role
			? [["role", { type: "role", role }], everyoneLevel]
			: [everyoneLevel];

		return levels
			.map(([level, overridden]) => ({
				userId,
				overridden,
				actions: draft.actions.filter((action) =>
					broader.some(
						({ rule, via }) =>
							via.includes(level) && rule.actions.includes(action),
					),
				),
			}))
			.filter((warning) => warning.actions.length > 0);
	});
};

export const precedenceWarningText = ({
	userName,
	overriddenName,
	actionLabels,
}: {
	userName: string;
	overriddenName: string;
	actionLabels: string[];
}) =>
	`${userName} is named directly, so ${overriddenName}'s rules no longer apply to them for ${joinWithAnd(actionLabels)}.`;
