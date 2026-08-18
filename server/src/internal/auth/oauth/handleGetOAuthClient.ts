import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { oauthClientRepo } from "../repos/index.js";
import { isAtmnOAuthClientRecord } from "./atmnOAuthClients.js";
import {
	ensureSummerOAuthClient,
	isSummerOAuthClientRecord,
} from "./summerOAuthClient.js";

type OAuthClientInfoInput = {
	clientId: string;
	name: string | null;
	metadata?: unknown;
};

// Display name comes from the client's own DCR-provided name.
export const buildOAuthClientInfoResponse = (client: OAuthClientInfoInput) => ({
	client_id: client.clientId,
	name: client.name || "Unknown Application",
	is_atmn: isAtmnOAuthClientRecord(client),
	default_env: isSummerOAuthClientRecord(client) ? "sandbox" : undefined,
});

export const handleGetOAuthClient = async (c: Context) => {
	const clientId = c.req.param("client_id");
	if (!clientId) {
		return c.json({ error: "client_id is required" }, 400);
	}

	const client =
		(await ensureSummerOAuthClient({ db, clientId })) ??
		(await oauthClientRepo.getByClientId({ db, clientId }));

	if (!client) {
		return c.json({ error: "Client not found" }, 404);
	}

	return c.json(buildOAuthClientInfoResponse(client));
};
