import { usageLimitFilterMatchesProperties } from "@models/cusModels/billingControls/usageLimit";
import type {
	CreditDimension,
	CreditMultiplier,
} from "@models/featureModels/featureConfig/creditConfig";
import { Decimal } from "decimal.js";

/**
 * The multipliers that apply to an event described by `match`.
 *
 * A rate row's match is a partial event, so a multiplier keyed on a property the
 * row does not pin cannot be shown to apply — only multipliers whose own keys are
 * all pinned by the row are certain.
 */
export const creditMultipliersForMatch = ({
	multipliers,
	match,
}: {
	multipliers: Record<string, CreditMultiplier>;
	match: CreditDimension["match"];
}): CreditMultiplier[] =>
	Object.values(multipliers).filter((multiplier) =>
		usageLimitFilterMatchesProperties({
			filterProperties: multiplier.match,
			eventProperties: match,
		}),
	);

/**
 * Factors multiply, adds sum — the same stacking the runtime applies, through
 * Decimal so the preview shows the number that will actually be charged.
 */
export const applyCreditMultipliers = ({
	amount,
	multipliers,
}: {
	amount: number;
	multipliers: CreditMultiplier[];
}): number => {
	const factor = multipliers.reduce(
		(product, multiplier) => product.mul(multiplier.factor ?? 1),
		new Decimal(1),
	);
	const add = multipliers.reduce(
		(sum, multiplier) => sum.add(multiplier.add ?? 0),
		new Decimal(0),
	);
	return new Decimal(amount).mul(factor).add(add).toNumber();
};
