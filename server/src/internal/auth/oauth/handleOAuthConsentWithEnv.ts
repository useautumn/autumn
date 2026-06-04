import { AppEnv } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthConsentRepo } from "../repos/index.js";
import { isAtmnOAuthClientId } from "./atmnOAuthClients.js";

type RequestFields = Record<string, unknown>;

const parseRequestFields = async (request: Request) => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return {};

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody);
			return body && typeof body === "object" ? (body as RequestFields) : {};
		} catch {
			return {};
		}
	}

	const params = new URLSearchParams(rawBody);
	return Object.fromEntries(params.entries());
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

export const handleOAuthConsentWithEnv = async (c: Context) => {
	const fields = await parseRequestFields(c.req.raw.clone());
	const response = await auth.handler(c.req.raw);

	if (!response.ok || !acceptedConsent(fields.accept)) {
		return response;
	}

	const clientId = getClientIdFromFields(fields);
	const redirectUri = getRedirectUriFromFields(fields);
	const env = parseEnv(fields.env);
	if (!clientId || !env || (await isAtmnOAuthClientId({ db, clientId }))) {
		return response;
	}

	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

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
	});

	return response;
};
