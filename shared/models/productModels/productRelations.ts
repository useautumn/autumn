import { relations } from "drizzle-orm";
import { entitlements } from "./entModels/entTable.js";
import { prices } from "./priceModels/priceTable.js";
import { products } from "./productTable.js";
import { freeTrials } from "./freeTrialModels/freeTrialTable.js";
import { organizations } from "../orgModels/orgTable.js";

export const productRelations = relations(products, ({ many, one }) => ({
	entitlements: many(entitlements),
	prices: many(prices),

	free_trials: many(freeTrials),
	org: one(organizations, {
		fields: [products.org_id],
		references: [organizations.id],
	}),
}));
