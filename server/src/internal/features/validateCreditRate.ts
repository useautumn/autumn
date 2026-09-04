import { type CreditTier, findCreditTierViolations } from "@autumn/shared";

type CreditRate = {
	tier_behavior?: "graduated";
	tiers?: CreditTier[];
	credit_amount?: number;
};

/** Checks a flat or graduated rate and coerces its numbers in place; shared by rows and dimensions. */
export const validateCreditRate = ({
	rate,
	invalidCreditSystem,
}: {
	rate: CreditRate;
	invalidCreditSystem: (message: string) => never;
}): void => {
	if (rate.tier_behavior === "graduated") {
		if (!Array.isArray(rate.tiers) || rate.tiers.length === 0) {
			invalidCreditSystem(
				"Graduated credit schemas require at least one tier.",
			);
		}

		const tiers = rate.tiers ?? [];
		for (const tier of tiers) {
			const creditAmount = Number(tier.credit_amount);
			if (!Number.isFinite(creditAmount) || creditAmount < 0) {
				invalidCreditSystem("Tier credit costs must be zero or greater.");
			}
			tier.credit_amount = creditAmount;
			if (tier.to !== "inf") tier.to = Number(tier.to);
		}

		const [violation] = findCreditTierViolations(tiers.map((tier) => tier.to));
		if (violation) invalidCreditSystem(violation.message);
		return;
	}

	const creditAmount = Number(rate.credit_amount);
	if (!Number.isFinite(creditAmount) || creditAmount < 0) {
		invalidCreditSystem("Credit cost must be zero or greater.");
	}
	rate.credit_amount = creditAmount;
};

export const minimumCreditRateAmount = (rate: CreditRate): number => {
	if (rate.tier_behavior !== "graduated") return rate.credit_amount ?? 0;
	// Reduced rather than spread: a long ladder would exceed the argument limit.
	return (rate.tiers ?? []).reduce(
		(lowest, tier) => Math.min(lowest, tier.credit_amount),
		Number.POSITIVE_INFINITY,
	);
};
