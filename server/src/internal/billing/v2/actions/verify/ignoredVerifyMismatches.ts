/** Findings an org has reviewed and accepted, keyed by org id rather than slug
 * so the customer is not identifiable here. */
export const IGNORED_VERIFY_RULES = {
	/** Schedules whose future phases carry the same prices as the current one
	 * only step a quantity; the subscription webhook applies it, so Autumn holds
	 * no phase for it by design. A schedule that changes price or plan still
	 * reports. */
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
