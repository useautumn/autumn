const DECIMALS = 10;
const MULTIPLIER = 10 ** DECIMALS;

// Port of round_to_precision(num, 10) — the deduction script's float-drift guard
// on remaining amounts (runDeductionOnContextV2.lua:11-14).
export const roundToPrecision = (value: number): number =>
	Math.floor(value * MULTIPLIER + 0.5) / MULTIPLIER;
