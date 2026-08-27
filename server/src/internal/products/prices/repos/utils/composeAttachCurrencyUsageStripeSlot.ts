import { PREVIEW_STRIPE_PRICE_ID_PREFIX, prices } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

const usableStripePriceId = (slot: SQL) => sql`
	${slot} IS NOT NULL
	AND ${slot} <> ''
	AND ${slot} NOT LIKE ${`${PREVIEW_STRIPE_PRICE_ID_PREFIX}%`}
`;

/** This currency's attach slot, whether it is base or overlay. Tiers stay in JS. */
export const composeAttachCurrencyUsageStripeSlot = ({
	targetCurrency,
	orgDefaultCurrency,
	slot = "stripe_price_id",
}: {
	targetCurrency: string;
	orgDefaultCurrency: string;
	slot?: "stripe_price_id" | "stripe_prepaid_price_v2_id";
}) => {
	const currency = targetCurrency.toLowerCase();
	const orgDefault = orgDefaultCurrency.toLowerCase();
	const baseStripePriceId = sql`${prices.config} ->> ${slot}`;
	const overlayStripePriceId = sql`${prices.config} -> 'currencies' -> ${currency} ->> ${slot}`;

	return sql`(
		(
			lower(coalesce(${prices.config} ->> 'base_currency', ${orgDefault})) = ${currency}
			AND ${usableStripePriceId(baseStripePriceId)}
		)
		OR ${usableStripePriceId(overlayStripePriceId)}
	)`;
};
