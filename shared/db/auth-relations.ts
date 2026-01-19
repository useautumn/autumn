import { relations } from "drizzle-orm";
import { organizations } from "../models/orgModels/orgTable.js";
import {
	account,
	invitation,
	member,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	session,
	user,
} from "./auth-schema.js";

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	memberships: many(member),
	invitations: many(invitation),
	oauthClients: many(oauthClient),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
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

// OAuth Provider relations
export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
	user: one(user, {
		fields: [oauthClient.userId],
		references: [user.id],
	}),
	oauthRefreshTokens: many(oauthRefreshToken),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent),
}));

export const oauthRefreshTokenRelations = relations(
	oauthRefreshToken,
	({ one, many }) => ({
		oauthClient: one(oauthClient, {
			fields: [oauthRefreshToken.clientId],
			references: [oauthClient.clientId],
		}),
		session: one(session, {
			fields: [oauthRefreshToken.sessionId],
			references: [session.id],
		}),
		user: one(user, {
			fields: [oauthRefreshToken.userId],
			references: [user.id],
		}),
		oauthAccessTokens: many(oauthAccessToken),
	}),
);

export const oauthAccessTokenRelations = relations(
	oauthAccessToken,
	({ one }) => ({
		oauthClient: one(oauthClient, {
			fields: [oauthAccessToken.clientId],
			references: [oauthClient.clientId],
		}),
		session: one(session, {
			fields: [oauthAccessToken.sessionId],
			references: [session.id],
		}),
		user: one(user, {
			fields: [oauthAccessToken.userId],
			references: [user.id],
		}),
		oauthRefreshToken: one(oauthRefreshToken, {
			fields: [oauthAccessToken.refreshId],
			references: [oauthRefreshToken.id],
		}),
	}),
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
	oauthClient: one(oauthClient, {
		fields: [oauthConsent.clientId],
		references: [oauthClient.clientId],
	}),
	user: one(user, {
		fields: [oauthConsent.userId],
		references: [user.id],
	}),
}));
