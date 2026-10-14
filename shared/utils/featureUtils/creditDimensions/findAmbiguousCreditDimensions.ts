import type { CreditDimension } from "@models/featureModels/featureConfig/creditConfig";

export type AmbiguousCreditDimensions = {
	names: [string, string];
	example: CreditDimension["match"];
};

export const matchesCanCoexist = (
	left: CreditDimension["match"],
	right: CreditDimension["match"],
): boolean =>
	Object.entries(left).every(([key, value]) => {
		const rightValue = Object.entries(right).find(([k]) => k === key)?.[1];
		return rightValue === undefined || rightValue === value;
	});

const sameSpecificity = (
	left: CreditDimension,
	right: CreditDimension,
): boolean =>
	Object.keys(left.match).length === Object.keys(right.match).length &&
	(left.priority ?? null) === (right.priority ?? null);

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
