import { relations } from "drizzle-orm";
import { products } from "../productTable.js";
import { freeTrials } from "./freeTrialTable.js";

export const freeTrialRelations = relations(freeTrials, ({ one }) => ({
	product: one(products, {
		fields: [freeTrials.internal_product_id],
		references: [products.internal_id],
	}),
}));
