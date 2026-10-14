import { Decimal } from "decimal.js";
import type { UnwoundLock } from "./unwindLock/types/unwoundLock.js";

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

export const unwoundLockToForwardValue = ({
	unwound,
	additionalValue,
	lockValue,
}: {
	unwound: UnwoundLock;
	additionalValue: number;
	lockValue: number;
}): number =>
	new Decimal(additionalValue)
		.minus(new Decimal(unwound.skippedValue).mul(Math.sign(lockValue)))
		.toNumber();
