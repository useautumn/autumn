import { Decimal } from "decimal.js";

/** How a lock at `lockValue` reaches `finalValue`: how much of it to give back, and how much more to take. */
export const splitFinalize = ({
	lockValue,
	finalValue,
}: {
	lockValue: number;
	finalValue: number;
}): { unwindValue: number; additionalValue: number } => {
	const lockMagnitude = Math.abs(lockValue);
	const finalMagnitude = Math.abs(finalValue);
	const signsDiffer = Math.sign(lockValue) !== Math.sign(finalValue);

	if (lockValue === 0) return { unwindValue: 0, additionalValue: finalValue };
	if (finalValue === 0)
		return { unwindValue: lockMagnitude, additionalValue: 0 };
	// A deduction settled as a credit, or the reverse: give it all back, then apply the final value whole.
	if (signsDiffer)
		return { unwindValue: lockMagnitude, additionalValue: finalValue };
	if (finalMagnitude >= lockMagnitude)
		return {
			unwindValue: 0,
			additionalValue: new Decimal(finalValue).minus(lockValue).toNumber(),
		};
	return {
		unwindValue: new Decimal(lockMagnitude).minus(finalMagnitude).toNumber(),
		additionalValue: 0,
	};
};
