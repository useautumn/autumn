import { Decimal } from "decimal.js";

/** Adds decimal values without floating-point drift. Nullish values are zero. */
export const addSafe = ({
	left,
	right,
}: {
	left: number | null | undefined;
	right: number | null | undefined;
}) => new Decimal(left ?? 0).plus(right ?? 0).toNumber();

/** Subtracts decimal values without floating-point drift. Nullish values are zero. */
export const subtractSafe = ({
	left,
	right,
}: {
	left: number | null | undefined;
	right: number | null | undefined;
}) => new Decimal(left ?? 0).minus(right ?? 0).toNumber();
