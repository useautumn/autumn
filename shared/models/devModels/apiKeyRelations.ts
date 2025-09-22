import { relations } from "drizzle-orm";
import { organizations } from "../orgModels/orgTable.js";
import { apiKeys } from "./apiKeyTable.js";

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
	org: one(organizations, {
		fields: [apiKeys.org_id],
		references: [organizations.id],
	}),
}));
