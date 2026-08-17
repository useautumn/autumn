import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { registerMcpOAuthClient } from "../actions/index.js";

const getRedirectUris = (value: unknown) =>
	Array.isArray(value)
		? value.filter((uri): uri is string => typeof uri === "string" && !!uri)
		: [];

export const handleMcpOAuthRegistration = async (c: Context) => {
	const { fields } = await parseOAuthRequestFields(c.req.raw);
	const result = await registerMcpOAuthClient({
		db,
		clientName: fields.client_name,
		redirectUris: getRedirectUris(fields.redirect_uris),
		scope: fields.scope,
	});

	if ("error" in result) {
		return c.json({ error: result.error }, result.status);
	}

	return c.json(result.body, result.status);
};
