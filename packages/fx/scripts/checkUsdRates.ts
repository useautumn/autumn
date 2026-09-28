/**
 * One-off sanity check of the provider against Frankfurter (ECB), read-only.
 *
 *   OPEN_EXCHANGE_RATES_APP_ID=… bun scripts/checkUsdRates.ts --date 2026-09-26
 *
 * Prints both rates for a handful of major currencies and the % gap; a gap over
 * 1% means the direction or the code mapping is wrong, not the market.
 */

import { convertToUsd } from "../src/convertToUsd";
import { createFxClient } from "../src/createFxClient";
import { getUsdRateTable } from "../src/getUsdRateTable";

const SAMPLE_CODES = ["EUR", "GBP", "JPY", "INR", "BRL", "CHF", "AUD"];
const MAX_GAP_PERCENT = 1;

const argValue = (flag: string): string | undefined => {
	const index = process.argv.indexOf(flag);
	return index === -1 ? undefined : process.argv[index + 1];
};

const date = argValue("--date");
if (!date) throw new Error("--date YYYY-MM-DD is required");

const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
if (!appId) throw new Error("OPEN_EXCHANGE_RATES_APP_ID is not set");

const fx = createFxClient({ config: { appId } });
const table = await getUsdRateTable({ ctx: { fx }, date });

const frankfurterResponse = await fetch(
	`https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${SAMPLE_CODES.join(",")}`,
);
if (!frankfurterResponse.ok) {
	throw new Error(`Frankfurter returned ${frankfurterResponse.status}`);
}
const frankfurter = (await frankfurterResponse.json()) as {
	date: string;
	rates: Record<string, number>;
};

console.log(`rates for ${date} (Frankfurter fixing date ${frankfurter.date})`);
console.log("code\tprovider\tfrankfurter\tgap%\t100 units → USD");
let worstGap = 0;
for (const code of SAMPLE_CODES) {
	const provider = table.rates[code];
	const reference = frankfurter.rates[code];
	const gap = ((provider - reference) / reference) * 100;
	worstGap = Math.max(worstGap, Math.abs(gap));
	const usd = convertToUsd({
		amount: 100,
		currency: code.toLowerCase(),
		rateTable: table,
	}).amountUsd;
	console.log(
		`${code}\t${provider}\t${reference}\t${gap.toFixed(2)}\t$${usd.toFixed(2)}`,
	);
}
console.log(
	worstGap <= MAX_GAP_PERCENT
		? `OK: worst gap ${worstGap.toFixed(2)}% ≤ ${MAX_GAP_PERCENT}%`
		: `CHECK: worst gap ${worstGap.toFixed(2)}% > ${MAX_GAP_PERCENT}%`,
);
