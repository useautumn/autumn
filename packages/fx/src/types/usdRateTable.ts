export const FX_SOURCE = "openexchangerates";

/** `1 USD = rates[code]` of that currency, as published for `date` (UTC calendar day). */
export type UsdRateTable = {
	date: string;
	source: typeof FX_SOURCE;
	rates: Record<string, number>;
};
