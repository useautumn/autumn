import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable";
import { entitlements } from "./entModels/entTable";
import { freeTrials } from "./freeTrialModels/freeTrialTable";
import { prices } from "./priceModels/priceTable";
import { products } from "./productTable";

export const productRelations = relations(products, ({ many, one }) => ({
	entitlements: many(entitlements),
	prices: many(prices),

	free_trials: many(freeTrials),
	org: one(organizations, {
		fields: [products.org_id],
		references: [organizations.id],
	}),
}));
