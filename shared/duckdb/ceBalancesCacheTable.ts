import { boolean, numeric, pgTable, text } from "drizzle-orm/pg-core";

/** MotherDuck cache `lake_cache.main.ce_balances`: narrow projection of the
 * Iceberg customer_entitlements table, rebuilt by cron from the current Glue
 * `metadata_location`. Queried via @duckdbfan/drizzle-duckdb (pg-core builders
 * are its documented schema syntax). */
export const ceBalancesCache = pgTable("ce_balances", {
	internal_customer_id: text().notNull(),
	internal_feature_id: text().notNull(),
	balance: numeric({ precision: 38, scale: 10, mode: "number" }),
	expires_at: numeric({ precision: 38, scale: 10, mode: "number" }),
	unlimited: boolean(),
	entitlement_id: text(),
	adjustment: numeric({ precision: 38, scale: 10, mode: "number" }),
	customer_product_id: text(),
});

/** The exact projection the refresh cron materializes — keep in lockstep with
 * `ceBalancesCache` columns. */
export const CE_BALANCES_CACHE_PROJECTION =
	"internal_customer_id, internal_feature_id, balance, expires_at, unlimited, entitlement_id, adjustment, customer_product_id" as const;

export type DbCeBalancesCache = typeof ceBalancesCache.$inferSelect;

/** Pre-aggregated totals (`lake_cache.main.ce_balance_totals`): the GROUP BY
 * runs once at refresh, not per nomination query. Clustered by
 * (feature, is_unlimited DESC, total DESC) at build so top-N prunes. */
export const ceBalanceTotalsCache = pgTable("ce_balance_totals", {
	internal_customer_id: text().notNull(),
	internal_feature_id: text().notNull(),
	is_unlimited: boolean().notNull(),
	/** Remaining balance (SUM of live cusEnt balances). */
	total: numeric({ precision: 38, scale: 10, mode: "number" }).notNull(),
	/** Granted ≈ SUM(entitlement allowance + adjustment); lake can't see
	 * product quantity, so exact quantities come from PG verification. */
	granted_total: numeric({
		precision: 38,
		scale: 10,
		mode: "number",
	}).notNull(),
});

export type DbCeBalanceTotalsCache = typeof ceBalanceTotalsCache.$inferSelect;
