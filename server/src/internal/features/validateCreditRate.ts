import type { CreditTier } from "@autumn/shared";

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
		let previousBoundary = 0;
		for (const [index, tier] of tiers.entries()) {
			const creditAmount = Number(tier.credit_amount);
			if (!Number.isFinite(creditAmount) || creditAmount < 0) {
				invalidCreditSystem("Tier credit costs must be zero or greater.");
			}
			tier.credit_amount = creditAmount;

			const isLastTier = index === tiers.length - 1;
			if (tier.to === "inf") {
				if (!isLastTier) {
					invalidCreditSystem(
						"Only the final graduated tier may use an infinity boundary.",
					);
				}
				continue;
			}

			const boundary = Number(tier.to);
			if (
				!Number.isFinite(boundary) ||
				boundary <= 0 ||
				boundary <= previousBoundary
			) {
				invalidCreditSystem(
					"Graduated tier boundaries must be positive and strictly increasing.",
				);
			}
			if (isLastTier) {
				invalidCreditSystem(
					"The final graduated tier must use an infinity boundary.",
				);
			}

			tier.to = boundary;
			previousBoundary = boundary;
		}
		return;
	}

	const creditAmount = Number(rate.credit_amount);
	if (!Number.isFinite(creditAmount) || creditAmount < 0) {
		invalidCreditSystem("Credit cost must be zero or greater.");
	}
	rate.credit_amount = creditAmount;
};

export const minimumCreditRateAmount = (rate: CreditRate): number =>
	rate.tier_behavior === "graduated"
		? Math.min(...(rate.tiers ?? []).map((tier) => tier.credit_amount))
		: (rate.credit_amount ?? 0);
