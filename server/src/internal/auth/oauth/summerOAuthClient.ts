import {
	getDefaultOAuthScopes,
	SUMMER_OAUTH_CLIENT_ID,
} from "@autumn/auth/oauth";
import { parseOAuthClientMetadata } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { oauthClientRepo } from "../repos/oauthClientRepo.js";

export const SUMMER_OAUTH_CLIENT_NAME = "Summer";

const SUMMER_REDIRECT_PORTS = [31548, 31549, 31550, 31551, 31552] as const;

const SUMMER_REDIRECT_URIS = SUMMER_REDIRECT_PORTS.map(
	(port) => `http://localhost:${port}/`,
);

const SUMMER_CLIENT_METADATA = {
	kind: "summer",
	client: "summer",
	source: "summer-cli",
} as const;

export const isSummerOAuthClientId = ({
	clientId,
}: {
	clientId: string | null | undefined;
}) => clientId === SUMMER_OAUTH_CLIENT_ID;

export const isSummerOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => {
	if (isSummerOAuthClientId({ clientId })) return true;

	const parsed = parseOAuthClientMetadata(metadata);
	return parsed.kind === "summer" || parsed.client === "summer";
};

export const ensureSummerOAuthClient = async ({
	clientId,
	db,
}: {
	clientId: string | null | undefined;
	db: DrizzleCli;
}) => {
	if (!isSummerOAuthClientId({ clientId })) return null;

	const now = new Date();
	return oauthClientRepo.upsert({
		db,
		insert: {
			id: generateId("oauth_client"),
			clientId: SUMMER_OAUTH_CLIENT_ID,
			name: SUMMER_OAUTH_CLIENT_NAME,
			redirectUris: SUMMER_REDIRECT_URIS,
			scopes: getDefaultOAuthScopes(),
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SUMMER_CLIENT_METADATA,
			createdAt: now,
			updatedAt: now,
		},
		update: {
			name: SUMMER_OAUTH_CLIENT_NAME,
			redirectUris: SUMMER_REDIRECT_URIS,
			scopes: getDefaultOAuthScopes(),
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SUMMER_CLIENT_METADATA,
			updatedAt: now,
		},
	});
};
