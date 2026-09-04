export type CreditTierBoundary = number | "inf";

/** One broken tier rule: which tier, and why. */
export type CreditTierViolation = {
	index: number;
	reason: "non_final_infinity" | "not_increasing" | "final_not_infinity";
	message: string;
};

const VIOLATION_MESSAGES: Record<CreditTierViolation["reason"], string> = {
	non_final_infinity: "Only the final tier may use an 'inf' boundary.",
	not_increasing: "Tier boundaries must be strictly increasing.",
	final_not_infinity: "The final tier must use an 'inf' boundary.",
};

/**
 * The graduated tier ladder rules, in one place: boundaries strictly increase,
 * only the final tier may use an "inf" boundary, and the final tier must use one.
 */
export const findCreditTierViolations = (
	boundaries: CreditTierBoundary[],
): CreditTierViolation[] => {
	const violations: CreditTierViolation[] = [];
	const violate = (index: number, reason: CreditTierViolation["reason"]) =>
		violations.push({ index, reason, message: VIOLATION_MESSAGES[reason] });

	let previousBoundary = 0;
	for (const [index, boundary] of boundaries.entries()) {
		const isLastTier = index === boundaries.length - 1;

		if (boundary === "inf") {
			if (!isLastTier) violate(index, "non_final_infinity");
			continue;
		}

		if (!Number.isFinite(boundary) || boundary <= previousBoundary) {
			violate(index, "not_increasing");
		}
		previousBoundary = boundary;

		if (isLastTier) violate(index, "final_not_infinity");
	}

	return violations;
};
