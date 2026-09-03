import type { CreditDimension } from "@autumn/shared";

const matchesCanCoexist = (
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

/** Two dimensions that could match one event with nothing to break the tie are rejected at save. */
export const validateDimensionsAreSeparable = ({
	dimensions,
	invalidCreditSystem,
}: {
	dimensions: [string, CreditDimension][];
	invalidCreditSystem: (message: string) => never;
}): void => {
	for (const [leftIndex, [leftName, left]] of dimensions.entries()) {
		for (const [rightName, right] of dimensions.slice(leftIndex + 1)) {
			const ambiguous =
				sameSpecificity(left, right) &&
				matchesCanCoexist(left.match, right.match);
			if (ambiguous) {
				invalidCreditSystem(
					`Dimensions "${leftName}" and "${rightName}" can both match the same event. Give one more match keys or a priority.`,
				);
			}
		}
	}
};
