import { customers, entities, features, organizations } from "@autumn/shared";

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
