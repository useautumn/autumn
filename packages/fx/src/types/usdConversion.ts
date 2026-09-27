/** One converted amount plus everything needed to audit it from the record alone. */
export type UsdConversion = {
	amountUsd: number;
	/** The provider code the rate was looked up under (`STN` for a `std` invoice). */
	rateCode: string;
	rate: number;
	rateDate: string;
	source: string;
};
