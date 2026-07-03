import { AUTUMN_ADMIN_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { type AppEnv, oauthConsent } from "@autumn/shared";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type OAuthConsentApiKeyRecord = {
	id: string;
	env: AppEnv | null;
	oauthApiKeyId: string | null;
	redirectUri: string | null;
	metadata: Record<string, unknown> | null;
};

export const listOAuthConsentsByReferenceId = async ({
	db,
	referenceId,
	env,
	includeInternal = false,
}: {
	db: DrizzleCli;
	referenceId: string;
	env?: AppEnv;
	includeInternal?: boolean;
}) => {
	// The dashboard/CMA reaches the Autumn MCP through this first-party client;
	// hide it from a user's authorized apps alongside admin/slack-admin consents.
	const internalMcpClientId = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;

	return db
		.select({
			id: oauthConsent.id,
			clientId: oauthConsent.clientId,
			userId: oauthConsent.userId,
			referenceId: oauthConsent.referenceId,
			scopes: oauthConsent.scopes,
			createdAt: oauthConsent.createdAt,
			updatedAt: oauthConsent.updatedAt,
		})
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.referenceId, referenceId),
				env
					? or(isNull(oauthConsent.env), eq(oauthConsent.env, env))
					: undefined,
				includeInternal
					? undefined
					: and(
							ne(oauthConsent.clientId, AUTUMN_ADMIN_OAUTH_CLIENT_ID),
							internalMcpClientId
								? ne(oauthConsent.clientId, internalMcpClientId)
								: undefined,
							sql`COALESCE(${oauthConsent.metadata}->>'kind', '') != 'slack_admin'`,
						),
			),
		);
};

export const getOAuthConsentOwner = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) => {
	const [consent] = await db
		.select({
			id: oauthConsent.id,
			clientId: oauthConsent.clientId,
			referenceId: oauthConsent.referenceId,
		})
		.from(oauthConsent)
		.where(eq(oauthConsent.id, consentId))
		.limit(1);

	return consent ?? null;
};

export const getOAuthConsentApiKeyRecord = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) => {
	const [consent] = await db
		.select({
			id: oauthConsent.id,
			env: oauthConsent.env,
			oauthApiKeyId: oauthConsent.oauthApiKeyId,
			redirectUri: oauthConsent.redirectUri,
			scopes: oauthConsent.scopes,
			metadata: oauthConsent.metadata,
		})
		.from(oauthConsent)
		.where(eq(oauthConsent.id, consentId))
		.limit(1);

	return consent ?? null;
};

export const getOAuthConsentMetadataById = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) => {
	const [consent] = await db
		.select({ metadata: oauthConsent.metadata })
		.from(oauthConsent)
		.where(eq(oauthConsent.id, consentId))
		.limit(1);

	return consent?.metadata ?? null;
};

export const listOAuthConsentsForClientUserOrg = async ({
	db,
	clientId,
	userId,
	referenceId,
}: {
	db: DrizzleCli;
	clientId: string;
	userId: string;
	referenceId: string;
}) =>
	db
		.select({
			id: oauthConsent.id,
			env: oauthConsent.env,
		})
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.clientId, clientId),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, referenceId),
			),
		)
		.limit(2);

export const updateOAuthConsentEnv = async ({
	db,
	clientId,
	userId,
	referenceId,
	env,
	redirectUri,
	scopes,
}: {
	db: DrizzleCli;
	clientId: string;
	userId: string;
	referenceId: string;
	env: AppEnv;
	redirectUri: string | null;
	scopes?: string[];
}) =>
	db
		.update(oauthConsent)
		.set({
			env,
			redirectUri,
			...(scopes ? { scopes } : {}),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(oauthConsent.clientId, clientId),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, referenceId),
			),
		);

export const getOAuthConsentForClientUserOrg = async ({
	db,
	clientId,
	userId,
	referenceId,
	env,
}: {
	db: DrizzleCli;
	clientId: string;
	userId: string;
	referenceId: string;
	env?: AppEnv;
}) => {
	const [consent] = await db
		.select({
			id: oauthConsent.id,
			env: oauthConsent.env,
			oauthApiKeyId: oauthConsent.oauthApiKeyId,
			redirectUri: oauthConsent.redirectUri,
			scopes: oauthConsent.scopes,
		})
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.clientId, clientId),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, referenceId),
				...(env ? [eq(oauthConsent.env, env)] : []),
			),
		)
		.limit(1);

	return consent ?? null;
};

export const updateOAuthConsentApiKey = async ({
	db,
	consentId,
	env,
	oauthApiKeyId,
}: {
	db: DrizzleCli;
	consentId: string;
	env: AppEnv;
	oauthApiKeyId: string | null;
}) =>
	db
		.update(oauthConsent)
		.set({
			env,
			oauthApiKeyId,
			updatedAt: new Date(),
		})
		.where(eq(oauthConsent.id, consentId));

export const deleteOAuthConsentById = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) => db.delete(oauthConsent).where(eq(oauthConsent.id, consentId));

export const oauthConsentRepo = {
	listByReferenceId: listOAuthConsentsByReferenceId,
	getOwner: getOAuthConsentOwner,
	getApiKeyRecord: getOAuthConsentApiKeyRecord,
	getMetadataById: getOAuthConsentMetadataById,
	listForClientUserOrg: listOAuthConsentsForClientUserOrg,
	updateEnv: updateOAuthConsentEnv,
	getForClientUserOrg: getOAuthConsentForClientUserOrg,
	updateApiKey: updateOAuthConsentApiKey,
	deleteById: deleteOAuthConsentById,
};
