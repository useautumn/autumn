import type { StripeReuseCandidate } from "./types/stripeReuseCandidate.js";

export const rankStripeReuseCandidates = ({
	candidates,
}: {
	candidates: StripeReuseCandidate[];
}): StripeReuseCandidate[] =>
	[...candidates].sort((left, right) => {
		const leftCustom = left.price.is_custom === true ? 1 : 0;
		const rightCustom = right.price.is_custom === true ? 1 : 0;
		if (leftCustom !== rightCustom) return leftCustom - rightCustom;

		return (right.price.created_at ?? 0) - (left.price.created_at ?? 0);
	});
