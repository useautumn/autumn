import { AppEnv, RecaseError } from "@autumn/shared";
import {
	asNonEmptyString,
	type OAuthRequestFields,
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthConsentRepo } from "../repos/oauthConsentRepo.js";
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

const jsonOAuthError = ({ error }: { error: RecaseError }) =>
	new Response(
		JSON.stringify({
			error: "invalid_scope",
			error_description: error.message,
		}),
		{
			status: error.statusCode,
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

const resolveConsentEnv = ({
	clientId,
	fields,
}: {
	clientId: string;
	fields: OAuthRequestFields;
}) =>
	parseEnv(fields.env) ??
	(isSummerOAuthClientId({ clientId }) ? AppEnv.Sandbox : null);

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

	const principal = await resolveConsentPrincipal(c.req.raw.headers);

	// Deliberate fall-through: with no session or no active organization there is
	// nothing to narrow against, so the request goes to better-auth untouched.
	// better-auth then has no session either, so it stops at its own login
	// redirect rather than issuing a code — the un-narrowed scope never becomes
	// a grant. The org-less-session case is left for the maintainer to tighten.
	let narrowed: { grantedScopes: string[]; request: Request } | null = null;
	if (principal) {
		try {
			narrowed = await narrowConsentScopes({
				fields,
				isJson,
				principal,
				request: c.req.raw,
			});
		} catch (error) {
			if (error instanceof RecaseError) return jsonOAuthError({ error });
			throw error;
		}
	}

	const response = await runBetterAuthHandler({
		request: narrowed?.request ?? c.req.raw,
		route: "oauth2/consent",
		context: { clientId },
	});
	if (!response.ok || !principal) return response;

	const env = resolveConsentEnv({ clientId, fields });
	if (!env || (await isAtmnOAuthClientId({ db, clientId }))) return response;

	await oauthConsentRepo.updateEnv({
		db,
		clientId,
		userId: principal.userId,
		referenceId: principal.orgId,
		env,
		redirectUri: getRedirectUriFromFields(fields),
		scopes: narrowed?.grantedScopes,
	});

	return response;
};
