import type { CreditDimension } from "@models/featureModels/featureConfig/creditConfig";

/** Two dimensions that can't be told apart, and one event that would match both. */
export type AmbiguousCreditDimensions = {
	names: [string, string];
	example: CreditDimension["match"];
};

/** True when no key disagrees, so one event could satisfy both matches at once. */
export const matchesCanCoexist = (
	left: CreditDimension["match"],
	right: CreditDimension["match"],
): boolean =>
	Object.entries(left).every(
		([key, value]) => right[key] === undefined || right[key] === value,
	);

const sameSpecificity = (
	left: CreditDimension,
	right: CreditDimension,
): boolean =>
	Object.keys(left.match).length === Object.keys(right.match).length &&
	(left.priority ?? null) === (right.priority ?? null);

/**
 * Pairs of dimensions that could both match one event with nothing to break the
 * tie: same number of match keys, same priority, and no key that disagrees.
 */
export const findAmbiguousCreditDimensions = (
	dimensions: Record<string, CreditDimension>,
): AmbiguousCreditDimensions[] => {
	const entries = Object.entries(dimensions);
	const ambiguous: AmbiguousCreditDimensions[] = [];
	for (const [leftIndex, [leftName, left]] of entries.entries()) {
		for (const [rightName, right] of entries.slice(leftIndex + 1)) {
			const clashes =
				sameSpecificity(left, right) &&
				matchesCanCoexist(left.match, right.match);
			if (clashes) {
				ambiguous.push({
					names: [leftName, rightName],
					example: { ...left.match, ...right.match },
				});
			}
		}
	}
	return ambiguous;
};

export const formatCreditMatch = (match: CreditDimension["match"]): string =>
	Object.entries(match)
		.map(([key, value]) => `${key}=${value}`)
		.join(", ");
