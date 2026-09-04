import {
	type CreditDimension,
	findAmbiguousCreditDimensions,
	formatCreditMatch,
} from "@autumn/shared";

/** Two dimensions that could match one event with nothing to break the tie are rejected at save. */
export const validateDimensionsAreSeparable = ({
	dimensions,
	invalidCreditSystem,
}: {
	dimensions: Record<string, CreditDimension>;
	invalidCreditSystem: (message: string) => never;
}): void => {
	const [ambiguous] = findAmbiguousCreditDimensions(dimensions);
	if (!ambiguous) return;
	const [leftName, rightName] = ambiguous.names;
	invalidCreditSystem(
		`Dimensions "${leftName}" and "${rightName}" can both match the same event (${formatCreditMatch(ambiguous.example)}). Give one more match keys or a priority.`,
	);
};
