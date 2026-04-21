import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../../db/utils.js";
import { entities } from "../../cusModels/entityModels/entityTable.js";
import { features } from "../../featureModels/featureTable.js";
import { entitlements } from "../../productModels/entModels/entTable.js";
import { customerProducts } from "../cusProductTable.js";
import type { EntityBalance } from "./cusEntModels.js";

export const customerEntitlements = pgTable(
	"customer_entitlements",
	{
		id: text().primaryKey().notNull(),
		customer_product_id: text(),
		entitlement_id: text().notNull(),
		internal_customer_id: text().notNull(),
		internal_entity_id: text(),
		internal_feature_id: text().notNull(),

		unlimited: boolean("unlimited").default(false),
		balance: numeric({ mode: "number" }).notNull().default(0),
		created_at: numeric({ mode: "number" }).notNull(),
		next_reset_at: numeric({ mode: "number" }),
		usage_allowed: boolean("usage_allowed").default(false),

		// Adjustment is how much balance changes. Eg. balance goes from 100 -> 200, adjustment is +100 (will deprecate soon)
		adjustment: numeric({ mode: "number" }),

		// New field, free_balance: how much balance can be deducted
		additional_balance: numeric({ mode: "number" }).notNull().default(0),

		// Need to work on free balance...
		entities: jsonb("entities").$type<Record<string, EntityBalance>>(),

		// Expiry for loose entitlements (entitlements without reset intervals)
		expires_at: numeric({ mode: "number" }),
		cache_version: integer("cache_version").default(0),

		// Optional...
		customer_id: text("customer_id"),
		feature_id: text("feature_id"),

		external_id: text("external_id"),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "entitlements_internal_feature_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_entity_id],
			foreignColumns: [entities.internal_id],
			name: "customer_entitlements_internal_entity_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "customer_entitlements_customer_product_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.entitlement_id],
			foreignColumns: [entitlements.id],
			name: "customer_entitlements_entitlement_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		index("idx_customer_entitlements_product_id").on(table.customer_product_id),
		index("idx_customer_entitlements_internal_customer_id").using(
			"hash",
			table.internal_customer_id,
		),
		index("idx_customer_entitlements_internal_customer_id_btree").on(
			table.internal_customer_id,
		),
		index("idx_customer_entitlements_entitlement_id").on(table.entitlement_id),
		index("idx_customer_entitlements_internal_entity_id").using(
			"hash",
			table.internal_entity_id,
		),
		index("idx_customer_entitlements_on_next_reset_at").on(table.next_reset_at),
		index("idx_customer_entitlements_loose_customer_expires")
			.on(table.internal_customer_id, table.expires_at)
			.where(sql`${table.customer_product_id} IS NULL`),
		index("idx_ce_customer_product_entities_object")
			.on(table.internal_customer_id)
			.where(
				sql`${table.customer_product_id} IS NOT NULL AND jsonb_typeof(${table.entities}) = 'object'`,
			),
	],
);

collatePgColumn(customerEntitlements.id, "C");
collatePgColumn(customerEntitlements.internal_customer_id, "C");

export type InsertCustomerEntitlement =
	typeof customerEntitlements.$inferInsert;
export type DbCustomerEntitlement =
	typeof customerEntitlements.$inferSelect;
export type InsertDbCustomerEntitlement =
	typeof customerEntitlements.$inferInsert;
