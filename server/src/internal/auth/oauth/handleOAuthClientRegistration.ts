import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { registerOAuthClient } from "../actions/registerOAuthClient.js";

export const handleOAuthClientRegistration = async (c: Context) => {
	const { fields } = await parseOAuthRequestFields(c.req.raw);
	const result = await registerOAuthClient({ body: fields, db });

	if ("error" in result) {
		return c.json({ error: result.error }, result.status);
	}

	return c.json(result.body, result.status);
};
