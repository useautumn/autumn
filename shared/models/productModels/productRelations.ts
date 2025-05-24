import { relations } from "drizzle-orm";
import { entitlements } from "./entModels/entTable.js";
import { prices } from "./priceModels/priceTable.js";
import { products } from "./productTable.js";

export const productRelations = relations(products, ({ many }) => ({
  entitlements: many(entitlements),
  prices: many(prices),
}));
