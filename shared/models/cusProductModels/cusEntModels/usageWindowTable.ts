import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { customers } from "../../cusModels/cusTable.js";
import { entities } from "../../cusModels/entityModels/entityTable.js";
import { features } from "../../featureModels/featureTable.js";
import { customerEntitlements } from "./cusEntTable.js";

/**
 * A single windowed usage counter, persisted as its own row scoped to the
 * CUSTOMER (not an entitlement): one row per (customer, capped feature,
 * window). `usage` is the running total consumed within [window_start_at,
 * window_end_at). The enforced limit is resolved at deduction time, so it is
 * not stored here.
 *
 * `internal_entity_id` is NULL for customer-scope counters; entity-scoped
 * windows (v2) will set it. `anchor_customer_entitlement_id` records which
 * entitlement supplied the window bounds at initialization (provenance only --
 * deleting that entitlement must never erase usage, hence ON DELETE SET NULL).
 */
export const UsageWindowSchema = z.object({
	id: z.string(),
	internal_customer_id: z.string(),
	internal_entity_id: z.string().nullable(),
	feature_id: z.string(),
	internal_feature_id: z.string(),
	// Canonical filter identity of the limit this counter serves; null/'' =
	// the unfiltered aggregate counter. Defaulted so pre-filter cached rows parse.
	filter_key: z.string().nullable().default(null),
	anchor_customer_entitlement_id: z.string().nullable(),
	window_start_at: z.number(),
	window_end_at: z.number(),
	usage: z.number(),
	updated_at: z.number(),
});

export const usageWindows = pgTable(
	"usage_windows",
	{
		id: text("id").primaryKey().notNull(),
		internal_customer_id: text("internal_customer_id").notNull(),
		internal_entity_id: text("internal_entity_id"),
		feature_id: text("feature_id").notNull(),
		internal_feature_id: text("internal_feature_id").notNull(),
		filter_key: text("filter_key"),
		anchor_customer_entitlement_id: text("anchor_customer_entitlement_id"),
		window_start_at: numeric({ mode: "number" }).notNull(),
		window_end_at: numeric({ mode: "number" }).notNull(),
		usage: numeric({ mode: "number" }).notNull().default(0),
		updated_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "usage_windows_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "usage_windows_internal_entity_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "usage_windows_internal_feature_id_fkey",
		}).onDelete("cascade"),
		// Provenance only: the anchor supplied the window bounds at init; its
		// deletion must not erase accumulated usage.
		foreignKey({
			columns: [table.anchor_customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "usage_windows_anchor_customer_entitlement_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),

		index("idx_usage_windows_internal_customer_id").on(
			table.internal_customer_id,
		),
		index("idx_uw_internal_feature_id")
			.on(table.internal_feature_id)
			.concurrently(),
		// ONE mutable counter row per scope + filter: bounds roll forward in
		// place, usage zeroes when its window closes. NULL internal_entity_id =
		// customer scope, NULL filter_key = the unfiltered aggregate counter;
		// COALESCE makes the key unique across all combinations.
		uniqueIndex("idx_usage_windows_customer_feature_scope")
			.on(
				table.internal_customer_id,
				table.internal_feature_id,
				sql`COALESCE(${table.internal_entity_id}, '')`,
				sql`COALESCE(${table.filter_key}, '')`,
			)
			.concurrently(),
	],
).enableRLS();

export type UsageWindow = typeof usageWindows.$inferSelect;
export type InsertUsageWindow = typeof usageWindows.$inferInsert;
export type DbUsageWindow = typeof usageWindows.$inferSelect;
export type InsertDbUsageWindow = typeof usageWindows.$inferInsert;
