import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { registerOAuthClient } from "../actions/registerOAuthClient.js";

export const handleOAuthClientRegistration = async (c: Context) => {
	const { fields } = await parseOAuthRequestFields(c.req.raw);
	const result = await registerOAuthClient({ body: fields, db });

	// RFC 7591 §3.2.2: `error` is one of the registered codes, and any human
	// detail rides along in `error_description`.
	if (result.status !== 201) {
		return c.json(
			{ error: result.error, error_description: result.error_description },
			result.status,
		);
	}
	return c.json(result.body, result.status);
};
