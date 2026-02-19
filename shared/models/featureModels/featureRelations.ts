import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable";
import { features } from "./featureTable";

export const featureRelations = relations(features, ({ one }) => ({
	org: one(organizations, {
		fields: [features.org_id],
		references: [organizations.id],
	}),
}));
