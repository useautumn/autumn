import { boolean, numeric, pgTable, text } from "drizzle-orm/pg-core";

export const ceBalancesCache = pgTable("ce_balances", {
	internal_customer_id: text().notNull(),
	internal_feature_id: text().notNull(),
	balance: numeric({ precision: 38, scale: 10, mode: "number" }),
	expires_at: numeric({ precision: 38, scale: 10, mode: "number" }),
	unlimited: boolean(),
	entitlement_id: text(),
	adjustment: numeric({ precision: 38, scale: 10, mode: "number" }),
	customer_product_id: text(),
	entities_balance: numeric({ precision: 38, scale: 10, mode: "number" }),
});

export const CE_BALANCES_CACHE_PROJECTION =
	`internal_customer_id, internal_feature_id, balance, expires_at, unlimited, entitlement_id, adjustment, customer_product_id, CASE WHEN json_type(TRY_CAST(entities AS JSON)) = 'OBJECT' THEN COALESCE(list_sum(list_transform(json_keys(entities), k -> CAST(json_extract(entities, '$."' || k || '".balance') AS DOUBLE))), 0) ELSE 0 END AS entities_balance` as const;

export type DbCeBalancesCache = typeof ceBalancesCache.$inferSelect;

export const ceBalanceTotalsCache = pgTable("ce_balance_totals", {
	internal_customer_id: text().notNull(),
	internal_feature_id: text().notNull(),
	is_unlimited: boolean().notNull(),
	total: numeric({ precision: 38, scale: 10, mode: "number" }).notNull(),
	granted_total: numeric({
		precision: 38,
		scale: 10,
		mode: "number",
	}).notNull(),
	usage_total: numeric({ precision: 38, scale: 10, mode: "number" }).notNull(),
	finite_rows: numeric({ precision: 38, scale: 0, mode: "number" }).notNull(),
});

export type DbCeBalanceTotalsCache = typeof ceBalanceTotalsCache.$inferSelect;
