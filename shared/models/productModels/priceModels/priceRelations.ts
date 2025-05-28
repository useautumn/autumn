import { relations } from "drizzle-orm";
import { prices } from "./priceTable.js";
import { products } from "../productTable.js";

export const priceRelations = relations(prices, ({ one }) => ({
  product: one(products, {
    fields: [prices.internal_product_id],
    references: [products.internal_id],
  }),
}));
