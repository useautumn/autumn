import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import { z } from "zod";

const tokenRequestFieldsSchema = z
	.object({
		client_id: z.string().min(1).optional(),
		grant_type: z.string().min(1).optional(),
		refresh_token: z.string().min(1).optional(),
	})
	.passthrough();

export type OAuthTokenRequestFields = {
	/** Null for confidential clients, which authenticate over the header instead. */
	clientId: string | null;
	grantType: string | null;
	refreshToken: string | null;
};

const EMPTY_TOKEN_REQUEST_FIELDS: OAuthTokenRequestFields = {
	clientId: null,
	grantType: null,
	refreshToken: null,
};

export const getOAuthTokenRequestFields = async (
	request: Request,
): Promise<OAuthTokenRequestFields> => {
	const { fields } = await parseOAuthRequestFields(request);
	const parsed = tokenRequestFieldsSchema.safeParse(fields);
	if (!parsed.success) return EMPTY_TOKEN_REQUEST_FIELDS;

	return {
		clientId: parsed.data.client_id ?? null,
		grantType: parsed.data.grant_type ?? null,
		refreshToken: parsed.data.refresh_token ?? null,
	};
};
