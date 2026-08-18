import { isMcpOAuthClientRecord } from "@autumn/auth/oauth";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthClientRepo } from "../repos/index.js";
import { ensureAtmnAuthorizeScopes } from "./atmnOAuthClients.js";
import { getMcpAuthorizeScopes } from "./mcpAuthorizeScopes.js";
import { ensureSummerOAuthClient } from "./summerOAuthClient.js";

export const handleOAuthAuthorize = async (c: Context) => {
	const url = new URL(c.req.raw.url);
	const clientId = url.searchParams.get("client_id");
	await ensureSummerOAuthClient({ db, clientId });

	// Old atmn CLIs request legacy CRUDL scopes; keep the reserved atmn client's
	// stored scopes covering them so better-auth /authorize never rejects.
	if (clientId) {
		await ensureAtmnAuthorizeScopes({
			db,
			clientId,
			scope: url.searchParams.get("scope"),
		});
	}

	const client = clientId
		? await oauthClientRepo.getByClientId({ db, clientId })
		: null;

	if (!isMcpOAuthClientRecord({ clientId, metadata: client?.metadata })) {
		return auth.handler(c.req.raw);
	}

	// A missing `scope` is left alone: better-auth then falls back to the
	// client's stored grant, which already carries offline_access.
	const requestedScope = url.searchParams.get("scope");
	if (requestedScope) {
		url.searchParams.set(
			"scope",
			getMcpAuthorizeScopes({
				clientScopes: client?.scopes,
				requestedScope,
			}).join(" "),
		);
	}

	const prompts = new Set(url.searchParams.get("prompt")?.split(" ") ?? []);
	prompts.add("consent");
	url.searchParams.set("prompt", [...prompts].filter(Boolean).join(" "));

	return auth.handler(new Request(url, c.req.raw));
};
