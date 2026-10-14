import {
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { customers } from "../cusModels/cusTable.js";
import type { AppEnv } from "../genModels/genEnums.js";

export const balanceLocks = pgTable(
	"balance_locks",
	{
		id: text("id").primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").$type<AppEnv>().notNull(),
		lock_id: text("lock_id").notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		customer_id: text("customer_id").notNull(),
		entity_id: text("entity_id"),
		feature_id: text("feature_id").notNull(),
		overage_behavior: text("overage_behavior").notNull(),
		properties: jsonb("properties").$type<Record<string, unknown> | null>(),
		deltas: jsonb("deltas").$type<unknown[]>().notNull(),
		expires_at: numeric({ mode: "number" }).notNull(),
		expiry_action: text("expiry_action").notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "balance_locks_internal_customer_id_fkey",
		}).onDelete("cascade"),
		uniqueIndex("balance_locks_org_env_lock_id_key")
			.on(table.org_id, table.env, table.lock_id)
			.concurrently(),
		index("idx_balance_locks_internal_customer_id")
			.on(table.internal_customer_id)
			.concurrently(),
		index("idx_balance_locks_expires_at").on(table.expires_at).concurrently(),
	],
);

export type BalanceLock = typeof balanceLocks.$inferSelect;
export type InsertBalanceLock = typeof balanceLocks.$inferInsert;
