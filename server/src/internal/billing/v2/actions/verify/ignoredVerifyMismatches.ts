export const IGNORED_VERIFY_RULES = {
	quantityOnlySchedule: "quantity_only_schedule",
} as const;

export type IgnoredVerifyRule =
	(typeof IGNORED_VERIFY_RULES)[keyof typeof IGNORED_VERIFY_RULES];

const IGNORED_RULES_BY_ORG: Record<string, IgnoredVerifyRule[]> = {
	J5DBNq2fVFPh3Od7QhKltZuRwihXHOCy: [IGNORED_VERIFY_RULES.quantityOnlySchedule],
};

export const orgIgnoresVerifyRule = ({
	orgId,
	rule,
}: {
	orgId: string;
	rule: IgnoredVerifyRule;
}) => (IGNORED_RULES_BY_ORG[orgId] ?? []).includes(rule);
