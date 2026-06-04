import { AppEnv, type ScopeString } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
	hashApiKey,
} from "@/internal/dev/api-keys/apiKeyUtils.js";
import type { ResourceAccessTokenRecord } from "@/internal/dev/cli/oauthApiKeyUtils.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import {
	type OAuthConsentApiKeyRecord,
	oauthApiKeyRepo,
	oauthClientRepo,
	oauthConsentRepo,
} from "../repos/index.js";

const isKeyForEnv = (apiKey: string, env: AppEnv) => {
	const prefix = env === AppEnv.Live ? ApiKeyPrefix.Live : ApiKeyPrefix.Sandbox;
	return apiKey.startsWith(`${prefix}_`);
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
	tokenRecord: ResourceAccessTokenRecord;
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
		orgId: tokenRecord.referenceId!,
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
	await oauthConsentRepo.updateApiKey({
		db,
		consentId: consent.id,
		env,
		oauthApiKeyId: apiKeyId,
		oauthApiKey: encryptData(apiKey),
	});

	return apiKey;
};

export const getOrCreateOAuthConsentApiKey = async ({
	db,
	consent,
	tokenRecord,
	env,
	scopes,
}: {
	db: DrizzleCli;
	consent: OAuthConsentApiKeyRecord;
	tokenRecord: ResourceAccessTokenRecord;
	env: AppEnv;
	scopes: ScopeString[];
}) => {
	let existingApiKey: string | null = null;

	if (consent.oauthApiKey) {
		try {
			existingApiKey = decryptData(consent.oauthApiKey);
		} catch {
			existingApiKey = null;
		}
	}

	if (existingApiKey && isKeyForEnv(existingApiKey, env)) {
		const keyName = await getOAuthClientApiKeyName({
			db,
			clientId: tokenRecord.clientId,
		});
		const apiKeyId = await oauthApiKeyRepo.updateLinkedScopes({
			db,
			apiKeyId: consent.oauthApiKeyId,
			apiKey: existingApiKey,
			scopes,
			name: keyName,
		});

		if (apiKeyId) {
			await oauthConsentRepo.updateApiKeyId({
				db,
				consentId: consent.id,
				oauthApiKeyId: apiKeyId,
			});
			return existingApiKey;
		}
	}

	await oauthApiKeyRepo.deleteLinked({
		db,
		apiKeyId: consent.oauthApiKeyId,
		apiKey: existingApiKey,
	});

	return createConsentApiKey({ db, consent, tokenRecord, env, scopes });
};
