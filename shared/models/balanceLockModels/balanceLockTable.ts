import {
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * An open lock: a deduction already taken, and the per-row deltas needed to undo it.
 * Written only by the balance worker, in the same transaction as the balance change; deleted at finalize.
 */
export const balanceLocks = pgTable(
	"balance_locks",
	{
		id: text("id").primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		/** The caller's id, unique per org and env. */
		lock_id: text("lock_id").notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		customer_id: text("customer_id").notNull(),
		entity_id: text("entity_id"),
		feature_id: text("feature_id").notNull(),
		/** Governs a confirm above the locked value, whatever the finalize call asks for. */
		overage_behavior: text("overage_behavior").notNull(),
		properties: jsonb("properties").$type<Record<string, unknown> | null>(),
		/** The deduction's deltas in draw order; finalize undoes them newest first. */
		deltas: jsonb("deltas").$type<unknown[]>().notNull(),
		/** Always set: the caller's value, else 24 hours after creation. */
		expires_at: numeric({ mode: "number" }).notNull(),
		/** What expiry does: `release` when the caller set expires_at, `confirm` for the 24 hour default. */
		expiry_action: text("expiry_action").notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		uniqueIndex("balance_locks_org_env_lock_id_key")
			.on(table.org_id, table.env, table.lock_id)
			.concurrently(),
		// The customer load reads a customer's open locks.
		index("idx_balance_locks_internal_customer_id")
			.on(table.internal_customer_id)
			.concurrently(),
		// The expiry sweep reads the oldest due locks.
		index("idx_balance_locks_expires_at")
			.on(table.expires_at)
			.concurrently(),
	],
);

export type BalanceLock = typeof balanceLocks.$inferSelect;
export type InsertBalanceLock = typeof balanceLocks.$inferInsert;
