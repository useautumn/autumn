import type { CreditSchemaItem } from "@autumn/shared";
import { validateCreditRate } from "../validateCreditRate.js";
import { validateCreditMultipliers } from "./validateCreditMultipliers.js";
import { validateDimensionsAreSeparable } from "./validateDimensionsAreSeparable.js";

/** Rules that only exist once a rate-card row has dimensions or multipliers. */
export const validateCreditDimensionRules = ({
	schemaItem,
	invalidCreditSystem,
}: {
	schemaItem: CreditSchemaItem;
	invalidCreditSystem: (message: string) => never;
}): void => {
	const dimensions = schemaItem.dimensions ?? {};
	for (const [name, dimension] of Object.entries(dimensions)) {
		if (
			dimension.priority !== undefined &&
			!Number.isInteger(dimension.priority)
		) {
			invalidCreditSystem(`Dimension "${name}" priority must be an integer.`);
		}
		validateCreditRate({ rate: dimension, invalidCreditSystem });
	}

	validateDimensionsAreSeparable({ dimensions, invalidCreditSystem });
	validateCreditMultipliers({ schemaItem, invalidCreditSystem });
};
