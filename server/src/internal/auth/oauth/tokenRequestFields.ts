import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import { z } from "zod";

const tokenRequestFieldsSchema = z
	.object({
		grant_type: z.string().min(1).optional(),
		refresh_token: z.string().min(1).optional(),
	})
	.passthrough();

export type OAuthTokenRequestFields = {
	grantType: string | null;
	refreshToken: string | null;
};

export const getOAuthTokenRequestFields = async (
	request: Request,
): Promise<OAuthTokenRequestFields> => {
	const { fields } = await parseOAuthRequestFields(request);
	const parsed = tokenRequestFieldsSchema.safeParse(fields);
	if (!parsed.success) return { grantType: null, refreshToken: null };

	return {
		grantType: parsed.data.grant_type ?? null,
		refreshToken: parsed.data.refresh_token ?? null,
	};
};

export const getRefreshTokenForConsentLookup = async (request: Request) => {
	const fields = await getOAuthTokenRequestFields(request);
	if (fields.grantType !== "refresh_token") return null;
	return fields.refreshToken;
};
