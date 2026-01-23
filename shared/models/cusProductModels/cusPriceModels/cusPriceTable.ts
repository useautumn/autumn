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
	],
);
