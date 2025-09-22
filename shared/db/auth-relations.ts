import { relations } from "drizzle-orm";
import { invitation, member, user } from "./auth-schema.js";
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

export const inviteRelations = relations(invitation, ({ one }) => ({
	organization: one(organizations, {
		fields: [invitation.organizationId],
		references: [organizations.id],
	}),
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));
