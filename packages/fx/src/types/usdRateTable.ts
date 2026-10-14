export const FX_SOURCE = "openexchangerates";

export type UsdRateTable = {
	date: string;
	source: typeof FX_SOURCE;
	rates: Record<string, number>;
};
