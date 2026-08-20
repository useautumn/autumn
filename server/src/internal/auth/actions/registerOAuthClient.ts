import {
	getDefaultOAuthScopes,
	isReservedOAuthClientName,
} from "@autumn/auth/oauth";
import { msToSeconds } from "@autumn/shared";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import { isSafeOAuthRedirectUri } from "@autumn/shared/utils/auth/oauthRedirectUris";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";
import { z } from "zod";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { type OAuthClientRecord, oauthClientRepo } from "../repos/index.js";

const DEFAULT_OAUTH_CLIENT_NAME = "MCP client";

// Unknown keys are stripped: better-auth otherwise folds them into metadata.
const registerRequestSchema = z.object({
	client_name: z.string().optional(),
	redirect_uris: z.array(z.string()),
	scope: z.string().optional(),
});

export type OAuthClientRegistration = {
	client_id: string;
	client_id_issued_at: number;
	client_name: string;
	redirect_uris: string[];
	scope: string;
	token_endpoint_auth_method: "none";
	grant_types: ["authorization_code", "refresh_token"];
	response_types: ["code"];
	public: true;
	type: "native";
};

/** RFC 7591 §3.2.2: `error` is an enum; the prose belongs in the description. */
export type OAuthClientRegistrationError = {
	error: "invalid_client_metadata" | "invalid_redirect_uri";
	error_description: string;
};

type RegisterOAuthClientResult =
	| { body: OAuthClientRegistration; status: 201 }
	| (OAuthClientRegistrationError & { status: 400 });

const toRegistration = (
	client: OAuthClientRecord,
): OAuthClientRegistration => ({
	client_id: client.clientId,
	client_id_issued_at: msToSeconds(client.createdAt?.getTime() ?? Date.now()),
	client_name: client.name ?? DEFAULT_OAUTH_CLIENT_NAME,
	redirect_uris: client.redirectUris,
	scope: client.scopes?.join(" ") ?? "",
	token_endpoint_auth_method: "none",
	grant_types: ["authorization_code", "refresh_token"],
	response_types: ["code"],
	public: true,
	type: "native",
});

const createOAuthClient = async ({
	clientId,
	clientName,
	db,
	redirectUris,
	scopes,
}: {
	clientId: string;
	clientName: string;
	db: DrizzleCli;
	redirectUris: string[];
	scopes: string[];
}) => {
	const now = new Date();

	return oauthClientRepo.insert({
		db,
		values: {
			id: generateId("oauth_client"),
			clientId,
			name: clientName,
			redirectUris,
			scopes,
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: { kind: MCP_CLIENT_KIND },
			createdAt: now,
			updatedAt: now,
		},
	});
};

/**
 * Dynamic client registration is append-only: every call mints a fresh client
 * so one caller can never take over another's registration by name or uri.
 */
export const registerOAuthClient = async ({
	body,
	db,
}: {
	body: unknown;
	db: DrizzleCli;
}): Promise<RegisterOAuthClientResult> => {
	const parsed = registerRequestSchema.safeParse(body);
	if (!parsed.success) {
		const redirectUrisFailed = parsed.error.issues.some(
			(issue) => issue.path[0] === "redirect_uris",
		);
		if (redirectUrisFailed) {
			return {
				error: "invalid_redirect_uri",
				error_description: "redirect_uris is required",
				status: 400,
			};
		}
		return {
			error: "invalid_client_metadata",
			error_description: "Client metadata is invalid",
			status: 400,
		};
	}

	const redirectUris = [...new Set(parsed.data.redirect_uris.filter(Boolean))];
	if (redirectUris.length === 0) {
		return {
			error: "invalid_redirect_uri",
			error_description: "redirect_uris is required",
			status: 400,
		};
	}
	if (!redirectUris.every(isSafeOAuthRedirectUri)) {
		return {
			error: "invalid_redirect_uri",
			error_description: "One or more redirect_uris are not allowed",
			status: 400,
		};
	}

	const clientName =
		parsed.data.client_name?.trim() || DEFAULT_OAUTH_CLIENT_NAME;
	if (isReservedOAuthClientName(clientName)) {
		return {
			error: "invalid_client_metadata",
			error_description: "client_name is reserved",
			status: 400,
		};
	}

	const scopes = getDefaultOAuthScopes(
		splitOAuthScopeString(parsed.data.scope),
	);
	const client = await createOAuthClient({
		clientId: generateId("oauth_client"),
		clientName,
		db,
		redirectUris,
		scopes,
	});
	return { body: toRegistration(client), status: 201 };
};
