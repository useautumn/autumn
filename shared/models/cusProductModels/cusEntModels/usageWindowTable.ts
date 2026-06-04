import {
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { features } from "../../featureModels/featureTable.js";
import { customerEntitlements } from "./cusEntTable.js";

/**
 * A single windowed usage counter, persisted as its own row beneath a customer
 * entitlement. `usage` is the running total consumed within [window_start_at,
 * window_end_at). The enforced limit is resolved at deduction time, so it is not
 * stored here.
 */
export const UsageWindowSchema = z.object({
	id: z.string(),
	customer_entitlement_id: z.string(),
	feature_id: z.string(),
	internal_feature_id: z.string(),
	window_start_at: z.number(),
	window_end_at: z.number(),
	usage: z.number(),
	updated_at: z.number(),
});

export const usageWindows = pgTable(
	"usage_windows",
	{
		id: text("id").primaryKey().notNull(),
		customer_entitlement_id: text("customer_entitlement_id").notNull(),
		feature_id: text("feature_id").notNull(),
		internal_feature_id: text("internal_feature_id").notNull(),
		window_start_at: numeric({ mode: "number" }).notNull(),
		window_end_at: numeric({ mode: "number" }).notNull(),
		usage: numeric({ mode: "number" }).notNull().default(0),
		updated_at: numeric({ mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "usage_windows_customer_entitlement_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "usage_windows_internal_feature_id_fkey",
		}).onDelete("cascade"),

		index("idx_usage_windows_customer_entitlement_id").on(
			table.customer_entitlement_id,
		),
		uniqueIndex("idx_usage_windows_cus_ent_feature_window").on(
			table.customer_entitlement_id,
			table.feature_id,
			table.window_start_at,
		),
	],
).enableRLS();

export type UsageWindow = typeof usageWindows.$inferSelect;
export type InsertUsageWindow = typeof usageWindows.$inferInsert;
export type DbUsageWindow = typeof usageWindows.$inferSelect;
export type InsertDbUsageWindow = typeof usageWindows.$inferInsert;
