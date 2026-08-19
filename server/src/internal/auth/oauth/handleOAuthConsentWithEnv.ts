import { AppEnv, RecaseError } from "@autumn/shared";
import {
	asNonEmptyString,
	type OAuthRequestFields,
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";
import type { Context } from "hono";
import { type DrizzleCli, db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthConsentRepo } from "../repos/index.js";
import { isAtmnOAuthClientId } from "./atmnOAuthClients.js";
import { getOAuthConsentScopeGrant } from "./oauthConsentScopes.js";
import { runBetterAuthHandler } from "./runBetterAuthHandler.js";
import { isSummerOAuthClientId } from "./summerOAuthClient.js";

const parseEnv = (value: unknown) => {
	if (value === AppEnv.Live || value === AppEnv.Sandbox) return value;
	return null;
};

const acceptedConsent = (value: unknown) => value === true || value === "true";

const getNestedOAuthField = (value: unknown, key: string) => {
	if (!value) return null;

	if (typeof value === "string") {
		try {
			return asNonEmptyString(JSON.parse(value)?.[key]);
		} catch {
			return new URLSearchParams(value).get(key);
		}
	}

	if (typeof value === "object") {
		return asNonEmptyString((value as Record<string, unknown>)[key]);
	}

	return null;
};

const getClientIdFromFields = (fields: OAuthRequestFields) =>
	asNonEmptyString(fields.client_id) ??
	getNestedOAuthField(fields.oauth_query, "client_id");

const getRedirectUriFromFields = (fields: OAuthRequestFields) =>
	asNonEmptyString(fields.redirect_uri) ??
	asNonEmptyString(fields.redirectUri) ??
	getNestedOAuthField(fields.oauth_query, "redirect_uri");

export const getOAuthConsentRequestedScopesFromFields = (
	fields: OAuthRequestFields,
) => {
	if ("scope" in fields) {
		return {
			explicit: true,
			scopes: splitOAuthScopeString(fields.scope),
		};
	}

	const rawScope = getNestedOAuthField(fields.oauth_query, "scope");
	return {
		explicit: false,
		scopes: rawScope ? splitOAuthScopeString(rawScope) : null,
	};
};

const jsonOAuthError = ({
	code,
	description,
	status,
}: {
	code: string;
	description: string;
	status: number;
}) =>
	new Response(
		JSON.stringify({ error: code, error_description: description }),
		{
			status,
			headers: { "Content-Type": "application/json" },
		},
	);

type ConsentPrincipal = { orgId: string; userId: string };

/** Only a session with an active organization can narrow or persist a grant. */
const resolveConsentPrincipal = async (
	headers: Headers,
): Promise<ConsentPrincipal | null> => {
	const session = await auth.api.getSession({ headers });
	const userId = session?.user?.id;
	const orgId = session?.session?.activeOrganizationId;

	return userId && orgId ? { orgId, userId } : null;
};

/**
 * Replaces the posted `scope` with what this user may actually grant, so
 * better-auth records the narrowed set on the consent row.
 */
const narrowConsentScopes = async ({
	fields,
	isJson,
	principal,
	request,
}: {
	fields: OAuthRequestFields;
	isJson: boolean;
	principal: ConsentPrincipal;
	request: Request;
}) => {
	const requested = getOAuthConsentRequestedScopesFromFields(fields);
	const grantedScopes = await getOAuthConsentScopeGrant({
		db,
		organizationId: principal.orgId,
		requestedScopes: requested.scopes,
		requireRequestedResourceScopes: requested.explicit,
		userId: principal.userId,
	});

	return {
		grantedScopes,
		request: rebuildOAuthRequest({
			fields: { ...fields, scope: grantedScopes.join(" ") },
			isJson,
			request,
		}),
	};
};

/**
 * The environment a consent grants in, and whether this client needs one at
 * all. Only atmn clients don't: every other client exchanges its grant for an
 * env-scoped api key, so an env-less consent issues a code that mints a token
 * no request can use.
 */
export const resolveOAuthConsentEnv = async ({
	clientId,
	db,
	fields,
}: {
	clientId: string;
	db: DrizzleCli;
	fields: OAuthRequestFields;
}) => ({
	env:
		parseEnv(fields.env) ??
		(isSummerOAuthClientId({ clientId }) ? AppEnv.Sandbox : null),
	envRequired: !(await isAtmnOAuthClientId({ db, clientId })),
});

export const handleOAuthConsentWithEnv = async (c: Context) => {
	const { fields, isJson } = await parseOAuthRequestFields(c.req.raw.clone());
	const clientId = getClientIdFromFields(fields);

	// A denial (or a request that names no client) carries no scopes or env to
	// narrow and persist — better-auth turns it straight into a redirect.
	if (!acceptedConsent(fields.accept) || !clientId) {
		return runBetterAuthHandler({
			request: c.req.raw,
			route: "oauth2/consent",
			context: { clientId },
		});
	}

	// better-auth's consent endpoint only requires a session, not an active
	// organization, so forwarding an accept we cannot narrow would let it record
	// the client's full requested scopes and issue a code.
	const principal = await resolveConsentPrincipal(c.req.raw.headers);
	if (!principal) {
		return jsonOAuthError({
			code: "access_denied",
			description:
				"Sign in and select an active organization to authorize this application.",
			status: 403,
		});
	}

	const { env, envRequired } = await resolveOAuthConsentEnv({
		clientId,
		db,
		fields,
	});
	if (envRequired && !env) {
		return jsonOAuthError({
			code: "invalid_request",
			description:
				"Select an environment (live or sandbox) to authorize this application.",
			status: 400,
		});
	}

	let narrowed: { grantedScopes: string[]; request: Request };
	try {
		narrowed = await narrowConsentScopes({
			fields,
			isJson,
			principal,
			request: c.req.raw,
		});
	} catch (error) {
		if (error instanceof RecaseError) {
			return jsonOAuthError({
				code: "invalid_scope",
				description: error.message,
				status: error.statusCode,
			});
		}
		throw error;
	}

	const response = await runBetterAuthHandler({
		request: narrowed.request,
		route: "oauth2/consent",
		context: { clientId },
	});
	if (!response.ok) return response;

	if (!env || !envRequired) return response;

	await oauthConsentRepo.updateEnv({
		db,
		clientId,
		userId: principal.userId,
		referenceId: principal.orgId,
		env,
		redirectUri: getRedirectUriFromFields(fields),
		scopes: narrowed.grantedScopes,
	});

	return response;
};
