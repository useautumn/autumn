import { relations } from "drizzle-orm";
import { member, user } from "./auth-schema.js";
import { organizations } from "../models/orgModels/orgTable.js";

export const userRelations = relations(user, ({ many }) => ({}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organizations, {
    fields: [member.organizationId],
    references: [organizations.id],
  }),
}));
