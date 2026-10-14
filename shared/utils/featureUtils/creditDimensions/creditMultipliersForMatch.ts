import { usageLimitFilterMatchesProperties } from "@models/cusModels/billingControls/usageLimit";
import type {
	CreditDimension,
	CreditMultiplier,
} from "@models/featureModels/featureConfig/creditConfig";
import { Decimal } from "decimal.js";

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
