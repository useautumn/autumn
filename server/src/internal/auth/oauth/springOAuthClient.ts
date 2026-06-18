import {
	getDefaultOAuthScopes,
	SPRING_OAUTH_CLIENT_ID,
} from "@autumn/auth/oauth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { oauthClientRepo } from "../repos/index.js";

export const SPRING_OAUTH_CLIENT_NAME = "Spring";

const SPRING_REDIRECT_PORTS = [31548, 31549, 31550, 31551, 31552] as const;

const SPRING_REDIRECT_URIS = SPRING_REDIRECT_PORTS.map(
	(port) => `http://localhost:${port}/`,
);

const SPRING_CLIENT_METADATA = {
	kind: "spring",
	client: "spring",
	source: "spring-cli",
} as const;

export const isSpringOAuthClientId = ({
	clientId,
}: {
	clientId: string | null | undefined;
}) => clientId === SPRING_OAUTH_CLIENT_ID;

export const isSpringOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => {
	if (isSpringOAuthClientId({ clientId })) return true;
	if (!metadata) return false;

	let metadataObject = metadata;
	if (typeof metadata === "string") {
		try {
			metadataObject = JSON.parse(metadata);
		} catch {
			return false;
		}
	}

	if (!metadataObject || typeof metadataObject !== "object") return false;
	const record = metadataObject as Record<string, unknown>;
	return record.kind === "spring" || record.client === "spring";
};

export const ensureSpringOAuthClient = async ({
	clientId,
	db,
}: {
	clientId: string | null | undefined;
	db: DrizzleCli;
}) => {
	if (!isSpringOAuthClientId({ clientId })) return null;

	const now = new Date();
	return oauthClientRepo.upsert({
		db,
		insert: {
			id: generateId("oauth_client"),
			clientId: SPRING_OAUTH_CLIENT_ID,
			name: SPRING_OAUTH_CLIENT_NAME,
			redirectUris: SPRING_REDIRECT_URIS,
			scopes: getDefaultOAuthScopes(),
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SPRING_CLIENT_METADATA,
			createdAt: now,
			updatedAt: now,
		},
		update: {
			name: SPRING_OAUTH_CLIENT_NAME,
			redirectUris: SPRING_REDIRECT_URIS,
			scopes: getDefaultOAuthScopes(),
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SPRING_CLIENT_METADATA,
			updatedAt: now,
		},
	});
};
