import { Decimal } from "decimal.js";
import type { CombinedMultipliers } from "./combineCreditMultipliers.js";

/** Factor first, then add; a rate that lands below zero is a configuration error. */
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
	return scaled.toNumber();
};
