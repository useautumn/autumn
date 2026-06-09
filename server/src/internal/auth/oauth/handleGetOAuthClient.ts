import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { oauthClientRepo } from "../repos/index.js";
import { isAtmnOAuthClientRecord } from "./atmnOAuthClients.js";
import {
	getInternalMcpDisplayName,
	isInternalMcpOAuthClientRecord,
} from "./internalMcpOAuthClients.js";

export const handleGetOAuthClient = async (c: Context) => {
	const clientId = c.req.param("client_id");
	const redirectUri = c.req.query("redirect_uri");
	if (!clientId) {
		return c.json({ error: "client_id is required" }, 400);
	}

	const client = await oauthClientRepo.getByClientId({ db, clientId });

	if (!client) {
		return c.json({ error: "Client not found" }, 404);
	}

	const isInternalMcp = isInternalMcpOAuthClientRecord(client);
	const internalMcpName = isInternalMcp
		? getInternalMcpDisplayName({
				metadata: client.metadata,
				redirectUri,
			})
		: null;

	return c.json({
		client_id: client.clientId,
		name: internalMcpName || client.name || "Unknown Application",
		is_atmn: isAtmnOAuthClientRecord(client),
		is_internal_mcp: isInternalMcp,
	});
};
