import { PREVIEW_STRIPE_PRICE_ID_PREFIX, prices } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

const usableStripePriceId = (slot: SQL) => sql`
	${slot} IS NOT NULL
	AND ${slot} <> ''
	AND ${slot} NOT LIKE ${`${PREVIEW_STRIPE_PRICE_ID_PREFIX}%`}
`;

/** This currency's amount + stripe_price_id, whether it is base or overlay. */
export const composeAttachCurrencyFixedMatch = ({
	targetCurrency,
	orgDefaultCurrency,
	amount,
}: {
	targetCurrency: string;
	orgDefaultCurrency: string;
	amount: number;
}) => {
	const currency = targetCurrency.toLowerCase();
	const orgDefault = orgDefaultCurrency.toLowerCase();
	const baseStripePriceId = sql`${prices.config} ->> 'stripe_price_id'`;
	const overlayStripePriceId = sql`${prices.config} -> 'currencies' -> ${currency} ->> 'stripe_price_id'`;

	return sql`(
		(
			lower(coalesce(${prices.config} ->> 'base_currency', ${orgDefault})) = ${currency}
			AND (${prices.config} ->> 'amount')::numeric = ${amount}
			AND ${usableStripePriceId(baseStripePriceId)}
		)
		OR
		(
			(${prices.config} -> 'currencies' -> ${currency} ->> 'amount')::numeric = ${amount}
			AND ${usableStripePriceId(overlayStripePriceId)}
		)
	)`;
};
