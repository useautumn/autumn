import { sql } from "drizzle-orm";
import {
	pgTable,
	text,
	numeric,
	boolean,
	jsonb,
	foreignKey,
	unique,
	bigint,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { customers } from "../cusModels/cusTable.js";

export const events = pgTable(
	"events",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		org_slug: text("org_slug").notNull(),
		internal_customer_id: text("internal_customer_id"),
		env: text().notNull(),
		created_at: bigint({ mode: "number" }),
		timestamp: timestamp({ mode: "date", withTimezone: true }),

		event_name: text("event_name").notNull(),
		idempotency_key: text("idempotency_key").default(sql`null`),
		value: numeric({ mode: "number" }),
		set_usage: boolean("set_usage").default(false),
		entity_id: text("entity_id"),
		internal_entity_id: text("internal_entity_id"),

		// Optional stuff...
		customer_id: text("customer_id").notNull(),
		properties: jsonb().$type<Record<string, any>>(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "events_internal_customer_id_fkey",
		}).onDelete("cascade"),
		unique("unique_event_constraint").on(
			table.org_id,
			table.env,
			table.customer_id,
			table.event_name,
			table.idempotency_key,
		),
		index("idx_events_internal_customer_id").on(table.internal_customer_id),
		index("idx_events_internal_entity_id").on(table.internal_entity_id),
	],
);

export type Event = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
