// Well inside 2^53, so adding a handful of them stays an exact integer.
const MAX_EXACT_INTEGER = 2 ** 50;

/** An integer small enough that plain addition with others like it is exact, as Decimal's would be. */
export const isExactInteger = (value: number): boolean =>
	Number.isInteger(value) && Math.abs(value) <= MAX_EXACT_INTEGER;
