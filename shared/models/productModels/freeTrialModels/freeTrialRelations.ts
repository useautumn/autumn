import { relations } from "drizzle-orm";
import { freeTrials } from "./freeTrialTable.js";
import { products } from "../productTable.js";

export const freeTrialRelations = relations(freeTrials, ({ one }) => ({
  product: one(products, {
    fields: [freeTrials.internal_product_id],
    references: [products.internal_id],
  }),
}));
