import { Decimal } from "decimal.js";
import type { CombinedMultipliers } from "./combineCreditMultipliers.js";

export const scaleCreditAmount = ({
	amount,
	multipliers,
	invalidRate,
}: {
	amount: number;
	multipliers: CombinedMultipliers;
	invalidRate: (message: string) => never;
}): number => {
	const scaled = new Decimal(amount)
		.mul(multipliers.factor)
		.add(multipliers.add);
	if (scaled.lt(0)) {
		invalidRate("Credit multipliers took the rate below zero");
	}
	const result = scaled.toNumber();
	if (!Number.isFinite(result)) {
		invalidRate("Credit multipliers produced a rate outside the numeric range");
	}
	return result;
};
