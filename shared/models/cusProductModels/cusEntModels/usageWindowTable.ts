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

export const UsageWindowSchema = z.object({
	id: z.string(),
	internal_customer_id: z.string(),
	internal_entity_id: z.string().nullable(),
	feature_id: z.string(),
	internal_feature_id: z.string(),
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
		// the whole table on every call as a result. See [[postgres-collation-index-trap]].
		index("idx_usage_windows_internal_customer_id_c")
			.on(sql`${table.internal_customer_id} COLLATE "C"`)
			.concurrently(),
		index("idx_uw_internal_feature_id")
			.on(table.internal_feature_id)
			.concurrently(),
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
