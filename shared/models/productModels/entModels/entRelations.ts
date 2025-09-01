import { relations } from "drizzle-orm";

import { features } from "../../featureModels/featureTable.js";
import { entitlements } from "./entTable.js";
import { products } from "../productTable.js";

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
	feature: one(features, {
		fields: [entitlements.internal_feature_id],
		references: [features.internal_id],
	}),
	product: one(products, {
		fields: [entitlements.internal_product_id],
		references: [products.internal_id],
	}),
}));
