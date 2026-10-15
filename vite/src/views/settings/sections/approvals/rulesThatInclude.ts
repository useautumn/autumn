import type { ApprovalRule, RuleSubject } from "@autumn/shared";

/** Whose rules to find: a role, or a member and the role they hold. */
export type RuleAudience =
	| { type: "role"; role: string }
	| { type: "user"; userId: string; role: string | null };

/** How a rule reaches the audience: naming it, naming the member's role, or Everyone. */
export type IncludedVia = "direct" | "role" | "everyone";

export type IncludedRule = { rule: ApprovalRule; via: IncludedVia[] };

const subjectVia = ({
	subject,
	audience,
}: {
	subject: RuleSubject;
	audience: RuleAudience;
}): IncludedVia | null => {
	if (subject.type === "everyone") return "everyone";
	if (subject.type === "user") {
		return audience.type === "user" && subject.user_id === audience.userId
			? "direct"
			: null;
	}
	if (subject.role !== audience.role) return null;
	return audience.type === "role" ? "direct" : "role";
};

const VIA_ORDER: IncludedVia[] = ["direct", "role", "everyone"];

export const rulesThatInclude = ({
	rules,
	audience,
}: {
	rules: ApprovalRule[];
	audience: RuleAudience;
}): IncludedRule[] =>
	rules
		.map((rule) => {
			const reached = new Set(
				rule.subjects.map((subject) => subjectVia({ subject, audience })),
			);
			return { rule, via: VIA_ORDER.filter((via) => reached.has(via)) };
		})
		.filter(({ via }) => via.length > 0);

/** "A, B and C": vite's lib predates `Intl.ListFormat`. */
export const joinWithAnd = (items: string[]) =>
	items.length < 2
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "includes John directly and via Engineering", as on the member page board. */
export const includedViaText = ({
	name,
	roleLabel,
	via,
}: {
	name: string;
	roleLabel: string | null;
	via: IncludedVia[];
}) => {
	const reasons: Record<IncludedVia, string> = {
		direct: "directly",
		role: `via ${roleLabel}`,
		everyone: "via Everyone",
	};
	return `includes ${name} ${joinWithAnd(via.map((item) => reasons[item]))}`;
};
