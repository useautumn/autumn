import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { registerMcpOAuthClient } from "../actions/index.js";

type RegisterBody = {
	redirect_uris?: unknown;
	client_name?: unknown;
	scope?: unknown;
};

const parseJsonObject = async (request: Request) => {
	const body = await request.json().catch(() => null);
	return body && typeof body === "object" ? (body as RegisterBody) : {};
};

const getRedirectUris = (value: unknown) =>
	Array.isArray(value)
		? value.filter((uri): uri is string => typeof uri === "string" && !!uri)
		: [];

export const handleMcpOAuthRegistration = async (c: Context) => {
	const body = await parseJsonObject(c.req.raw);
	const result = await registerMcpOAuthClient({
		db,
		clientName: body.client_name,
		redirectUris: getRedirectUris(body.redirect_uris),
		scope: body.scope,
	});

	if ("error" in result) {
		return c.json({ error: result.error }, result.status);
	}

	return c.json(result.body, result.status);
};
