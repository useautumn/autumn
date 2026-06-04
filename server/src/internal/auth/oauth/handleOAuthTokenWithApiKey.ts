import { RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
	scopesFromOAuthScopeString,
} from "./oauthAccessTokenApiKey.js";

const getString = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

const getResourceFromTokenRequest = async (request: Request) => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return null;

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody) as Record<string, unknown>;
			const resource = body.resource;
			if (Array.isArray(resource)) return getString(resource[0]);
			return getString(resource);
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(rawBody);
	return params.getAll("resource")[0] ?? null;
};

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	const resource = await getResourceFromTokenRequest(c.req.raw.clone());
	const response = await auth.handler(c.req.raw);
	if (!response.ok) return response;

	let body: Record<string, unknown>;
	try {
		body = (await response.clone().json()) as Record<string, unknown>;
	} catch {
		return response;
	}

	const accessToken = getString(body.access_token);
	if (!accessToken) return response;

	const requestedScopes = scopesFromOAuthScopeString(body.scope);
	let apiKeyResult: Awaited<ReturnType<typeof getExternalOAuthApiKeyForToken>>;
	try {
		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource,
			requestedScopes,
		});
		apiKeyResult = await getExternalOAuthApiKeyForToken({
			db,
			tokenRecord,
			requestedScopes,
		});
	} catch (error) {
		if (error instanceof RecaseError) {
			return c.json(
				{
					error: "invalid_grant",
					error_description: error.message,
				},
				error.statusCode as 400 | 401 | 403,
			);
		}
		throw error;
	}
	if (!apiKeyResult) return response;

	return c.json({
		...body,
		access_token: apiKeyResult.apiKey,
		scope: apiKeyResult.scopes.join(" "),
	});
};
