import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	type PgColumn,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import type { TrackDeduction } from "../../api/balances/track/trackResponseV3.js";
import { customers } from "../cusModels/cusTable.js";

// Factory: fresh builders per call (sharing one builder object across pgTable calls is buggy).
export const eventColumns = () => ({
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
	internal_product_id: text("internal_product_id"),

	// Optional stuff...
	customer_id: text("customer_id").notNull(),
	properties: jsonb().$type<Record<string, any>>(),
	deductions: jsonb().$type<TrackDeduction[]>(),
});

export const eventUnique = (
	t: Record<keyof ReturnType<typeof eventColumns>, PgColumn>,
) =>
	unique("unique_event_constraint").on(
		t.org_id,
		t.env,
		t.customer_id,
		t.event_name,
		t.idempotency_key,
	);

export const events = pgTable("events", eventColumns(), (table) => [
	foreignKey({
		columns: [table.internal_customer_id],
		foreignColumns: [customers.internal_id],
		name: "events_internal_customer_id_fkey",
	}).onDelete("cascade"),
	eventUnique(table),
	index("idx_events_internal_customer_id").on(table.internal_customer_id),
	index("idx_events_internal_entity_id").on(table.internal_entity_id),
	index("idx_events_customer_non_usage_ts")
		.on(
			table.internal_customer_id,
			sql`${table.timestamp} DESC`,
			sql`${table.id} DESC`,
		)
		.where(sql`${table.set_usage} = false`),
	index("idx_events_timestamp").on(table.timestamp).concurrently(),
]);

export type Event = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
