import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Freshness ledger for replica-read routing: structural writes stamp the DB
// clock here; fillfactor 70 for HOT updates is set by a custom migration.
export const customerLsns = pgTable(
	"customer_lsns",
	{
		org_id: text("org_id").notNull(),
		env: text("env").notNull(),
		customer_id: text("customer_id").notNull(),
		internal_customer_id: text("internal_customer_id"),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.default(sql`now()`),
	},
	(table) => [
		primaryKey({
			name: "customer_lsns_pkey",
			columns: [table.org_id, table.env, table.customer_id],
		}),
	],
).enableRLS();

export type DbCustomerLsn = typeof customerLsns.$inferSelect;
export type InsertDbCustomerLsn = typeof customerLsns.$inferInsert;
