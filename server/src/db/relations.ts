import { relations } from "drizzle-orm";
import { apiKeys, organizations } from "./schema/index.js";

export const organizationsRelations = relations(organizations, ({ many }) => ({
  api_keys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.org_id],
    references: [organizations.id],
  }),
}));
