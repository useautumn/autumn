import { prices } from "@autumn/shared";
import { asc, desc } from "drizzle-orm";

export const composeReusablePriceRankOrder = () => [
	asc(prices.is_custom),
	desc(prices.created_at),
];
