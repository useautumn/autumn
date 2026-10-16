import type { ApprovalRule, RuleSubject } from "@autumn/shared";

/** Whose rules to find: a role, or a member and the role they hold. */
export type RuleAudience =
	| { type: "role"; roleId: string }
	| { type: "user"; userId: string; roleId: string | null };

/** How a rule reaches the audience: naming it, naming the member's role, or Everyone. */
export type IncludedVia = "direct" | "role" | "everyone";

type IncludableRule = Pick<ApprovalRule, "subjects" | "position">;

export type IncludedRule<Rule extends IncludableRule> = {
	rule: Rule;
	via: IncludedVia[];
};

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
	if (subject.role_id !== audience.roleId) return null;
	return audience.type === "role" ? "direct" : "role";
};

const VIA_ORDER: IncludedVia[] = ["direct", "role", "everyone"];

const levelOf = ({ via }: { via: IncludedVia[] }) => VIA_ORDER.indexOf(via[0]);

/** Most specific level first, as rules are decided; list order within a level. */
export const rulesThatInclude = <Rule extends IncludableRule>({
	rules,
	audience,
}: {
	rules: Rule[];
	audience: RuleAudience;
}): IncludedRule<Rule>[] =>
	rules
		.map((rule) => {
			const reached = new Set(
				rule.subjects.map((subject) => subjectVia({ subject, audience })),
			);
			return { rule, via: VIA_ORDER.filter((via) => reached.has(via)) };
		})
		.filter(({ via }) => via.length > 0)
		.sort(
			(a, b) => levelOf(a) - levelOf(b) || a.rule.position - b.rule.position,
		);

/** "A, B and C": vite's lib predates `Intl.ListFormat`. */
export const joinWithAnd = (items: string[]) =>
	items.length < 2
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "includes John directly and via Engineering", as on the member page board. */
export const includedViaText = ({
	name,
	roleName,
	via,
}: {
	name: string;
	roleName: string | null;
	via: IncludedVia[];
}) => {
	const reasons: Record<IncludedVia, string> = {
		direct: "directly",
		role: `via ${roleName}`,
		everyone: "via Everyone",
	};
	return `includes ${name} ${joinWithAnd(via.map((item) => reasons[item]))}`;
};
