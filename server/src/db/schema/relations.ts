import { relations } from "drizzle-orm";
import { features } from "./tables/featuresTable.js";
import { products } from "./tables/productsTable.js";
import { organizations } from "./tables/orgTable.js";
import { apiKeys } from "./tables/apiKeysTable.js";
import { entitlements } from "./tables/entitlementsTable.js";
import { prices } from "./tables/pricesTable.js";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  apiKeys: many(apiKeys),
  features: many(features),
}));

export const featuresRelations = relations(features, ({ one }) => ({
  org: one(organizations, {
    fields: [features.org_id],
    references: [organizations.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  org: one(organizations, {
    fields: [products.org_id],
    references: [organizations.id],
  }),
  entitlements: many(entitlements),
  prices: many(prices),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  feature: one(features, {
    fields: [entitlements.internal_feature_id],
    references: [features.internal_id],
  }),
}));
