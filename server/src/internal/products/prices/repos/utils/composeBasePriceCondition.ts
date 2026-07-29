import { prices, PriceType } from "@autumn/shared";
import { and, isNull, sql } from "drizzle-orm";

export const composeBasePriceCondition = () =>
	and(
		isNull(prices.entitlement_id),
		sql`${prices.config} ->> 'type' = ${PriceType.Fixed}`,
	);
