import { AppEnv, RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthConsentRepo } from "../repos/index.js";
import { isAtmnOAuthClientId } from "./atmnOAuthClients.js";
import { getOAuthConsentScopeGrant } from "./oauthConsentScopes.js";

type RequestFields = Record<string, unknown>;

const parseRequestFields = async (request: Request) => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return { contentType, fields: {}, rawBody };

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody);
			return {
				contentType,
				fields: body && typeof body === "object" ? (body as RequestFields) : {},
				rawBody,
			};
		} catch {
			return { contentType, fields: {}, rawBody };
		}
	}

	const params = new URLSearchParams(rawBody);
	return { contentType, fields: Object.fromEntries(params.entries()), rawBody };
};

const getString = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

const parseEnv = (value: unknown) => {
	if (value === AppEnv.Live || value === AppEnv.Sandbox) return value;
	return null;
};

const acceptedConsent = (value: unknown) => value === true || value === "true";

const getNestedOAuthField = (value: unknown, key: string) => {
	if (!value) return null;

	if (typeof value === "string") {
		try {
			return getString(JSON.parse(value)?.[key]);
		} catch {
			return new URLSearchParams(value).get(key);
		}
	}

	if (typeof value === "object") {
		return getString((value as Record<string, unknown>)[key]);
	}

	return null;
};

const getClientIdFromFields = (fields: RequestFields) =>
	getString(fields.client_id) ??
	getNestedOAuthField(fields.oauth_query, "client_id");

const getRedirectUriFromFields = (fields: RequestFields) =>
	getString(fields.redirect_uri) ??
	getString(fields.redirectUri) ??
	getNestedOAuthField(fields.oauth_query, "redirect_uri");

const getScopesFromFields = (fields: RequestFields) => {
	const rawScope = getNestedOAuthField(fields.oauth_query, "scope");
	return rawScope?.split(/\s+/).filter(Boolean) ?? null;
};

const getFieldsWithScope = ({
	fields,
	scope,
}: {
	fields: RequestFields;
	scope: string;
}) => {
	return { ...fields, scope };
};

const withScope = ({
	contentType,
	request,
	fields,
	scope,
}: {
	contentType: string;
	request: Request;
	fields: RequestFields;
	scope: string;
}) => {
	const scopedFields = getFieldsWithScope({ fields, scope });
	if (contentType.includes("application/json")) {
		return new Request(request, {
			body: JSON.stringify(scopedFields),
		});
	}

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(scopedFields)) {
		if (typeof value === "string") params.set(key, value);
	}

	return new Request(request, { body: params });
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
	const { contentType, fields } = await parseRequestFields(c.req.raw.clone());
	const clientId = getClientIdFromFields(fields);
	const redirectUri = getRedirectUriFromFields(fields);
	const env = parseEnv(fields.env);

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
				const scopeGrant = await getOAuthConsentScopeGrant({
					db,
					organizationId: orgId,
					requestedScopes: getScopesFromFields(fields),
					userId,
				});
				grantedScopes = scopeGrant;
				request = withScope({
					contentType,
					request,
					fields,
					scope: scopeGrant.join(" "),
				});
			} catch (error) {
				if (error instanceof RecaseError) {
					return jsonOAuthError({ error });
				}
				throw error;
			}
		}
	}

	const response = await auth.handler(request);

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
