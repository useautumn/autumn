import { relations } from "drizzle-orm";
import { orgJoinRequests } from "./orgJoinRequestTable.js";
import { organizations } from "./orgTable.js";
import { user } from "../../db/auth-schema.js";

export const orgJoinRequestRelations = relations(orgJoinRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgJoinRequests.organizationId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [orgJoinRequests.userId],
    references: [user.id],
  }),
  inviter: one(user, {
    fields: [orgJoinRequests.inviterId],
    references: [user.id],
  }),
}));
