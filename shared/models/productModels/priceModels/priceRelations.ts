import { relations } from "drizzle-orm";
import { products } from "../productTable";
import { prices } from "./priceTable";

export const priceRelations = relations(prices, ({ one }) => ({
	product: one(products, {
		fields: [prices.internal_product_id],
		references: [products.internal_id],
	}),
}));
