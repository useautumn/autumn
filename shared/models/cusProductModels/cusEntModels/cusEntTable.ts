import {
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { collatePgColumn } from "../../../db/utils.js";
import { features } from "../../featureModels/featureTable.js";
import { entitlements } from "../../productModels/entModels/entTable.js";
import { customerProducts } from "../cusProductTable.js";
import type { EntityBalance } from "./cusEntModels.js";

export const customerEntitlements = pgTable(
	"customer_entitlements",
	{
		id: text().primaryKey().notNull(),
		customer_product_id: text().notNull(),
		entitlement_id: text().notNull(),
		internal_customer_id: text().notNull(),
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
		additional_granted_balance: numeric({ mode: "number" })
			.notNull()
			.default(0),

		// Need to work on free balance...
		entities: jsonb("entities").$type<Record<string, EntityBalance>>(),

		// Optional...
		customer_id: text("customer_id"),
		feature_id: text("feature_id"),
	},
	(table) => [
		foreignKey({
			columns: [table.internal_feature_id],
			foreignColumns: [features.internal_id],
			name: "entitlements_internal_feature_id_fkey",
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
	],
);

collatePgColumn(customerEntitlements.id, "C");
