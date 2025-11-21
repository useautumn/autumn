import { relations } from "drizzle-orm";
import { user } from "../../db/auth-schema.js";
import { organizations } from "../orgModels/orgTable.js";
import { apiKeys } from "./apiKeyTable.js";

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
	org: one(organizations, {
		fields: [apiKeys.org_id],
		references: [organizations.id],
	}),
	user: one(user, {
		fields: [apiKeys.user_id],
		references: [user.id],
	}),
}));
