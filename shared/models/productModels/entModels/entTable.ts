import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";
import type { RolloverConfig } from "../../../index";
import { features } from "../../featureModels/featureTable";
import { rewards } from "../../rewardModels/rewardModels/rewardTable";
import { products } from "../productTable";

export const entitlements = pgTable(
	"entitlements",
	{
		id: text().primaryKey().notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
		internal_feature_id: text().notNull(),
		internal_product_id: text(),
		internal_reward_id: text("internal_reward_id"),
		is_custom: boolean().default(false),

		allowance_type: text(),
		allowance: numeric({ mode: "number" }),
		interval: text(),
		interval_count: numeric({ mode: "number" }).default(1),

		carry_from_previous: boolean("carry_from_previous").default(false),
		pooled: boolean("pooled").notNull().default(false),
		entity_feature_id: text("entity_feature_id").default(sql`null`),

		// Optional fields
		org_id: text("org_id"),
		feature_id: text("feature_id"),
		usage_limit: numeric({ mode: "number" }),
		expiry_duration: text("expiry_duration"),
		expiry_length: numeric({ mode: "number" }),

		rollover: jsonb().$type<RolloverConfig>(),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "entitlements_internal_feature_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_product_id],
			foreignColumns: [products.internal_id],
			name: "entitlements_internal_product_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.internal_reward_id],
			foreignColumns: [rewards.internal_id],
			name: "entitlements_internal_reward_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("entitlements_id_key").on(table.id),
		index("idx_entitlements_internal_product_id").on(table.internal_product_id),
		index("idx_entitlements_internal_reward_id").on(table.internal_reward_id),
		index("idx_entitlements_reward_feature").on(
			table.internal_reward_id,
			table.internal_feature_id,
		),
		index("idx_entitlements_internal_feature_id_c")
			.on(sql`${table.internal_feature_id} COLLATE "C"`)
			.concurrently(),
		index("idx_entitlements_internal_feature_id")
			.on(table.internal_feature_id)
			.concurrently(),
		// Serves joins on rewards.internal_id (collation C). The plain
		// internal_reward_id index above is default-collation and can't be used
		// when the join collation is C.
		index("idx_entitlements_internal_reward_id_c_partial")
			.on(sql`${table.internal_reward_id} COLLATE "C"`)
			.where(sql`${table.internal_reward_id} IS NOT NULL`),
	],
);

export type DbEntitlement = typeof entitlements.$inferSelect;
export type InsertDbEntitlement = typeof entitlements.$inferInsert;
