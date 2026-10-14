import {
	type CreditDimension,
	findAmbiguousCreditDimensions,
	formatCreditMatch,
} from "@autumn/shared";

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
