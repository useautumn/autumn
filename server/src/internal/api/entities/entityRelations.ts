import { entities } from "@shared/models/cusModels/entityModels/entityTable.js";
import { customers } from "@shared/models/cusModels/cusTable.js";
import { features } from "@shared/models/featureModels/featureTable.js";
import { organizations } from "@shared/models/orgModels/orgTable.js";
import { relations } from "drizzle-orm";

export const entityRelations = relations(entities, ({ one }) => ({
  customer: one(customers, {
    fields: [entities.internal_customer_id],
    references: [customers.internal_id],
  }),
  feature: one(features, {
    fields: [entities.internal_feature_id],
    references: [features.internal_id],
  }),
  organization: one(organizations, {
    fields: [entities.org_id],
    references: [organizations.id],
  }),
}));
