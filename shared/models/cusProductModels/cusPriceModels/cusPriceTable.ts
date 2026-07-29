import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
} from "drizzle-orm/pg-core";

import { customers } from "../../cusModels/cusTable.js";
import { prices } from "../../productModels/priceModels/priceTable.js";
import { customerProducts } from "../cusProductTable.js";

export const customerPrices = pgTable(
	"customer_prices",
	{
		id: text().primaryKey().notNull(),
		created_at: numeric({ mode: "number" }).notNull(),
		price_id: text("price_id"),
		options: jsonb(),
		internal_customer_id: text("internal_customer_id"),
		customer_product_id: text("customer_product_id"),
	},
	(table) => [
		foreignKey({
			columns: [table.customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "customer_prices_customer_product_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.internal_customer_id],
			foreignColumns: [customers.internal_id],
			name: "customer_prices_internal_customer_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.price_id],
			foreignColumns: [prices.id],
			name: "customer_prices_price_id_fkey",
		}),
		index("idx_customer_prices_product_id").on(table.customer_product_id),
		index("idx_customer_prices_price_id").on(table.price_id),
		// Serves the customers.internal_id (collation C) delete cascade. A plain
		// index can't be used when the comparison collation is C.
		index("idx_customer_prices_internal_customer_id")
			.on(sql`${table.internal_customer_id} COLLATE "C"`)
			.where(sql`${table.internal_customer_id} IS NOT NULL`)
			.concurrently(),
		index("idx_cpr_customer_product_id_c")
			.on(sql`${table.customer_product_id} COLLATE "C"`)
			.concurrently(),
	],
);

export type DbCustomerPrice = typeof customerPrices.$inferSelect;
export type InsertDbCustomerPrice = typeof customerPrices.$inferInsert;
