import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { sqlNow } from "../../db/utils.js";
import { customers } from "../cusModels/cusTable.js";
import { customerEntitlements } from "../cusProductModels/cusEntModels/cusEntTable.js";
import { customerProducts } from "../cusProductModels/cusProductTable.js";
import { features } from "../featureModels/featureTable.js";
import type { EntInterval } from "../productModels/intervals/entitlementInterval.js";

export enum PooledBalanceResetMode {
	Lazy = "lazy",
	Subscription = "subscription",
	Lifetime = "lifetime",
}

export const pooledBalances = pgTable(
	"pooled_balances",
	{
		id: text().primaryKey().notNull(),
		org_id: text().notNull(),
		env: text().notNull(),
		internal_customer_id: text().notNull(),
		internal_feature_id: text().notNull(),
		granted: numeric({ mode: "number" }).notNull().default(0),

		interval: text().$type<EntInterval>().notNull(),
		interval_count: numeric({ mode: "number" }).notNull().default(1),

		reset_cycle_anchor: numeric({ mode: "number" }),
		reset_mode: text().$type<PooledBalanceResetMode>().notNull(),
		stripe_subscription_id: text(),
		customer_license_link_id: text(),
		rollover_signature: text().notNull().default("none"),
		customer_entitlement_id: text().notNull(),
		last_applied_reset_at: numeric({ mode: "number" }),

		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "pooled_balances_customer_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "pooled_balances_feature_fkey",
		}).onDelete("restrict"),
		foreignKey({
			columns: [table.customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "pooled_balances_customer_entitlement_fkey",
		}).onDelete("restrict"),
		unique("unique_pooled_balance")
			.on(
				table.internal_customer_id,
				table.internal_feature_id,
				table.interval,
				table.interval_count,
				table.reset_cycle_anchor,
				table.reset_mode,
				table.stripe_subscription_id,
				table.customer_license_link_id,
				table.rollover_signature,
			)
			.nullsNotDistinct(),
		check(
			"pooled_balances_interval_count_positive",
			sql`${table.interval_count} > 0`,
		),
		check("pooled_balances_granted_non_negative", sql`${table.granted} >= 0`),
		check(
			"pooled_balances_reset_mode_valid",
			sql`${table.reset_mode} IN ('lazy', 'subscription', 'lifetime')`,
		),
		check(
			"pooled_balances_lifecycle_ids_valid",
			sql`(
				${table.reset_mode} = 'subscription'
				AND ${table.stripe_subscription_id} IS NOT NULL
				AND ${table.customer_license_link_id} IS NULL
			) OR (
				${table.reset_mode} = 'lazy'
				AND ${table.stripe_subscription_id} IS NULL
			) OR (
				${table.reset_mode} = 'lifetime'
				AND ${table.stripe_subscription_id} IS NULL
				AND ${table.customer_license_link_id} IS NULL
			)`,
		),
		unique("unique_pooled_balance_customer_entitlement").on(
			table.customer_entitlement_id,
		),
		index("idx_pooled_balances_org").on(table.org_id).concurrently(),
		index("idx_pooled_balances_reset_mode")
			.on(table.internal_customer_id, table.reset_mode)
			.concurrently(),
		index("idx_pooled_balances_feature")
			.on(table.internal_feature_id)
			.concurrently(),
		index("idx_pooled_balances_stripe_subscription")
			.on(table.internal_customer_id, table.stripe_subscription_id)
			.where(sql`${table.stripe_subscription_id} IS NOT NULL`)
			.concurrently(),
		index("idx_pooled_balances_customer_license")
			.on(table.internal_customer_id, table.customer_license_link_id)
			.where(sql`${table.customer_license_link_id} IS NOT NULL`)
			.concurrently(),
	],
);

export const pooledBalanceContributions = pgTable(
	"pooled_balance_contributions",
	{
		id: text().primaryKey().notNull(),
		pooled_balance_id: text().notNull(),
		source_customer_product_id: text().notNull(),
		source_customer_entitlement_id: text().notNull(),
		current_contribution: numeric({ mode: "number" }).notNull().default(0),
		next_cycle_contribution: numeric({ mode: "number" }).notNull().default(0),
		effective_at: numeric({ mode: "number" }),
		created_at: numeric({ mode: "number" }).notNull().default(sqlNow),
		updated_at: numeric({ mode: "number" }).notNull().default(sqlNow),
	},
	(table) => [
		foreignKey({
			columns: [table.pooled_balance_id],
			foreignColumns: [pooledBalances.id],
			name: "pooled_balance_contributions_pool_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.source_customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "pooled_balance_contributions_customer_product_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.source_customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "pooled_balance_contributions_customer_entitlement_fkey",
		}).onDelete("cascade"),
		check(
			"pooled_balance_contributions_current_non_negative",
			sql`${table.current_contribution} >= 0`,
		),
		check(
			"pooled_balance_contributions_next_non_negative",
			sql`${table.next_cycle_contribution} >= 0`,
		),
		unique("unique_pooled_balance_contribution").on(
			table.source_customer_entitlement_id,
		),
		index("idx_pooled_balance_contributions_pool")
			.on(table.pooled_balance_id)
			.concurrently(),
		index("idx_pooled_balance_contributions_source_customer_entitlement")
			.on(table.source_customer_entitlement_id)
			.concurrently(),
	],
);

export type DbPooledBalance = typeof pooledBalances.$inferSelect;
export type InsertPooledBalance = typeof pooledBalances.$inferInsert;
export type DbPooledBalanceContribution =
	typeof pooledBalanceContributions.$inferSelect;
export type InsertPooledBalanceContribution =
	typeof pooledBalanceContributions.$inferInsert;
