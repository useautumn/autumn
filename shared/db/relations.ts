import { apiKeys } from "./apiKeysTable.js";

import { organizations } from "../models/orgModels/orgTable.js";
import { relations } from "drizzle-orm";

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.org_id],
    references: [organizations.id],
  }),
}));
