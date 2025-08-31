import { relations } from "drizzle-orm";
import { member, user } from "./auth-schema.js";
import { organizations } from "../models/orgModels/orgTable.js";

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(member),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organizations, {
    fields: [member.organizationId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));
