import { relations } from "drizzle-orm";
import { entities } from "./entityTable.js";
import { customers } from "../cusTable.js";
import { features } from "../../featureModels/featureTable.js";
import { organizations } from "../../orgModels/orgTable.js";

export const entitiesRelations = relations(entities, ({ one }) => ({
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
