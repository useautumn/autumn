import { AppEnv, RecaseError } from "@autumn/shared";
import {
	getOAuthStringField,
	type OAuthRequestFields,
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
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
			return getOAuthStringField(JSON.parse(value)?.[key]);
		} catch {
			return new URLSearchParams(value).get(key);
		}
	}

	if (typeof value === "object") {
		return getOAuthStringField((value as Record<string, unknown>)[key]);
	}

	return null;
};

const getClientIdFromFields = (fields: OAuthRequestFields) =>
	getOAuthStringField(fields.client_id) ??
	getNestedOAuthField(fields.oauth_query, "client_id");

const getRedirectUriFromFields = (fields: OAuthRequestFields) =>
	getOAuthStringField(fields.redirect_uri) ??
	getOAuthStringField(fields.redirectUri) ??
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

export const handleOAuthConsentWithEnv = async (c: Context) => {
	const { fields, isJson } = await parseOAuthRequestFields(c.req.raw.clone());
	const clientId = getClientIdFromFields(fields);
	const redirectUri = getRedirectUriFromFields(fields);
	const env =
		parseEnv(fields.env) ??
		(isSummerOAuthClientId({ clientId }) ? AppEnv.Sandbox : null);

	let request = c.req.raw;
	let grantedScopes: string[] | undefined;
	if (acceptedConsent(fields.accept) && clientId) {
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		const userId = session?.user?.id;
		const orgId = session?.session?.activeOrganizationId;
		if (userId && orgId) {
			try {
				const requested = getOAuthConsentRequestedScopesFromFields(fields);
				const scopeGrant = await getOAuthConsentScopeGrant({
					db,
					organizationId: orgId,
					requestedScopes: requested.scopes,
					requireRequestedResourceScopes: requested.explicit,
					userId,
				});
				grantedScopes = scopeGrant;
				request = rebuildOAuthRequest({
					fields: { ...fields, scope: scopeGrant.join(" ") },
					isJson,
					request,
				});
			} catch (error) {
				if (error instanceof RecaseError) {
					return jsonOAuthError({ error });
				}
				throw error;
			}
		}
	}

	const response = await runBetterAuthHandler({
		request,
		route: "oauth2/consent",
		context: { clientId },
	});

	if (!response.ok || !acceptedConsent(fields.accept)) {
		return response;
	}

	if (!clientId || !env || (await isAtmnOAuthClientId({ db, clientId }))) {
		return response;
	}

	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	const userId = session?.user?.id;
	const orgId = session?.session?.activeOrganizationId;
	if (!userId || !orgId) return response;

	await oauthConsentRepo.updateEnv({
		db,
		clientId,
		userId,
		referenceId: orgId,
		env,
		redirectUri,
		scopes: grantedScopes,
	});

	return response;
};
