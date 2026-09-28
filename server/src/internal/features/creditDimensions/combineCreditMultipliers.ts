import type { CreditMultiplier } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	type EventProperties,
	matchesEventProperties,
} from "./matchesEventProperties.js";

export type CombinedMultipliers = { factor: Decimal; add: Decimal };

/** Every matching multiplier stacks: factors multiply together, adds sum. */
export const combineCreditMultipliers = ({
	multipliers,
	eventProperties,
}: {
	multipliers: Record<string, CreditMultiplier>;
	eventProperties: EventProperties;
}): CombinedMultipliers => {
	const matching = Object.values(multipliers).filter((multiplier) =>
		matchesEventProperties({ match: multiplier.match, eventProperties }),
	);
	const factor = matching.reduce(
		(product, multiplier) => product.mul(multiplier.factor ?? 1),
		new Decimal(1),
	);
	const add = matching.reduce(
		(sum, multiplier) => sum.add(multiplier.add ?? 0),
		new Decimal(0),
	);
	return { factor, add };
};
