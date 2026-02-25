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
import { collatePgColumn } from "../../../db/utils";
import { entitlements } from "../entModels/entTable";
import { products } from "../productTable";
import type { FixedPriceConfig } from "./priceConfig/fixedPriceConfig";
import type { UsagePriceConfig } from "./priceConfig/usagePriceConfig";
import type { ProrationConfig } from "./priceModels";

export const prices = pgTable(
	"prices",
	{
		id: text().primaryKey().notNull(),
		org_id: text("org_id").notNull(),
		internal_product_id: text("internal_product_id").notNull(),
		config: jsonb().$type<FixedPriceConfig | UsagePriceConfig>(),
		created_at: numeric({ mode: "number" }).notNull(),
		billing_type: text("billing_type"),
		is_custom: boolean("is_custom").default(false),
		entitlement_id: text("entitlement_id").default(sql`null`),
		proration_config: jsonb("proration_config")
			.$type<ProrationConfig>()
			.default(sql`null`),
	},
	(table) => [
		foreignKey({
			columns: [table.entitlement_id],
			foreignColumns: [entitlements.id],
			name: "prices_entitlement_id_fkey",
		}),
		foreignKey({
			columns: [table.internal_product_id],
			foreignColumns: [products.internal_id],
			name: "prices_internal_product_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("prices_id_key").on(table.id),
		index("idx_prices_internal_product_id").on(table.internal_product_id),
	],
);

collatePgColumn(prices.id, "C");
