import { AppEnv, type ScopeString } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
	hashApiKey,
} from "@/internal/dev/api-keys/apiKeyUtils.js";
import type { ResourceAccessTokenRecord } from "@/internal/dev/cli/oauthApiKeyUtils.js";
import {
	type OAuthConsentApiKeyRecord,
	oauthApiKeyRepo,
	oauthClientRepo,
	oauthConsentRepo,
} from "../repos/index.js";

type OAuthApiKeyTokenRecord = ResourceAccessTokenRecord & {
	userId: string;
	referenceId: string;
};

const getOAuthClientApiKeyName = async ({
	db,
	clientId,
}: {
	db: DrizzleCli;
	clientId: string;
}) => {
	const client = await oauthClientRepo.getByClientId({ db, clientId });

	return `OAuth Key - ${client?.name || clientId.slice(0, 8)}`;
};

const createConsentApiKey = async ({
	db,
	consent,
	tokenRecord,
	env,
	scopes,
}: {
	db: DrizzleCli;
	consent: OAuthConsentApiKeyRecord;
	tokenRecord: OAuthApiKeyTokenRecord;
	env: AppEnv;
	scopes: ScopeString[];
}) => {
	const prefix = env === AppEnv.Live ? ApiKeyPrefix.Live : ApiKeyPrefix.Sandbox;
	const keyName = await getOAuthClientApiKeyName({
		db,
		clientId: tokenRecord.clientId,
	});
	const apiKey = await createKey({
		db,
		env,
		name: keyName,
		orgId: tokenRecord.referenceId,
		userId: tokenRecord.userId ?? undefined,
		prefix,
		meta: {
			oauth_consent_id: consent.id,
			oauth_client_id: tokenRecord.clientId,
			oauth_redirect_uri: consent.redirectUri,
			created_via: "oauth",
			generatedAt: new Date().toISOString(),
			env,
		},
		scopes,
	});

	const hashedKey = hashApiKey(apiKey);
	const apiKeyId = await oauthApiKeyRepo.getIdByHashedKey({ db, hashedKey });
	if (!apiKeyId) {
		throw new Error("OAuth API key was not persisted");
	}

	await oauthConsentRepo.updateApiKey({
		db,
		consentId: consent.id,
		env,
		oauthApiKeyId: apiKeyId,
	});

	return { apiKey, apiKeyId };
};

export const rotateOAuthConsentApiKey = async ({
	db,
	consent,
	tokenRecord,
	env,
	scopes,
}: {
	db: DrizzleCli;
	consent: OAuthConsentApiKeyRecord;
	tokenRecord: OAuthApiKeyTokenRecord;
	env: AppEnv;
	scopes: ScopeString[];
}) => {
	const previousApiKeyId = consent.oauthApiKeyId;
	const { apiKey, apiKeyId } = await createConsentApiKey({
		db,
		consent,
		tokenRecord,
		env,
		scopes,
	});

	if (previousApiKeyId && previousApiKeyId !== apiKeyId) {
		await oauthApiKeyRepo.deleteConsentLinked({
			db,
			apiKeyId: previousApiKeyId,
			consentId: consent.id,
			clientId: tokenRecord.clientId,
			redirectUri: consent.redirectUri,
			orgId: tokenRecord.referenceId,
			userId: tokenRecord.userId,
			env,
		});
	}

	return apiKey;
};
