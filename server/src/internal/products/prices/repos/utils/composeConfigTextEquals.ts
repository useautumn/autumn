import { prices } from "@autumn/shared";
import { sql } from "drizzle-orm";

export const composeConfigTextEquals = ({
	key,
	value,
}: {
	key: "feature_id" | "internal_feature_id" | "bill_when" | "interval";
	value: string | null | undefined;
}) =>
	value == null
		? sql`${prices.config} ->> ${key} IS NULL`
		: sql`${prices.config} ->> ${key} = ${value}`;
