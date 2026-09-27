import { Decimal } from "decimal.js";
import { currencyToRateCode } from "./currencyToRateCode.js";
import type { UsdConversion } from "./types/usdConversion.js";
import type { UsdRateTable } from "./types/usdRateTable.js";

const USD_CODE = "USD";
const USD_DECIMAL_PLACES = 2;

export class MissingRateError extends Error {
	constructor({
		currency,
		code,
		date,
	}: {
		currency: string;
		code: string;
		date: string;
	}) {
		super(
			`No usable ${code} rate for ${date} (invoice currency "${currency}")`,
		);
		this.name = "MissingRateError";
	}
}

const usableRate = ({
	rateTable,
	code,
}: {
	rateTable: UsdRateTable;
	code: string;
}): number | null => {
	if (code === USD_CODE) return 1;
	const rate = rateTable.rates[code];
	return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : null;
};

/** Major-unit `amount` in `currency` → USD at the table's date. Rounds once, 2dp half-up. Throws rather than guess. */
export const convertToUsd = ({
	amount,
	currency,
	rateTable,
}: {
	amount: number;
	currency: string;
	rateTable: UsdRateTable;
}): UsdConversion => {
	const { code, scale } = currencyToRateCode({ currency });
	const rate = usableRate({ rateTable, code });
	if (rate === null) {
		throw new MissingRateError({ currency, code, date: rateTable.date });
	}

	const amountUsd = new Decimal(amount)
		.div(scale)
		.div(rate)
		.toDecimalPlaces(USD_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
		.toNumber();

	return {
		amountUsd,
		rateCode: code,
		rate,
		rateDate: rateTable.date,
		source: rateTable.source,
	};
};
