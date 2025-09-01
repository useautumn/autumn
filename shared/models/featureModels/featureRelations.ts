import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable.js";
import { features } from "./featureTable.js";

export const featureRelations = relations(features, ({ one }) => ({
	org: one(organizations, {
		fields: [features.org_id],
		references: [organizations.id],
	}),
}));
