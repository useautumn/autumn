import { z } from "zod";

const oauthTokenPayloadSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1).optional(),
	expires_in: z.number().optional(),
	scope: z.string().optional(),
});

const oauthTokenResponseSchema = z.preprocess((value) => {
	if (value && typeof value === "object" && "response" in value) {
		return (value as { response?: unknown }).response;
	}

	return value;
}, oauthTokenPayloadSchema);

export const parseOAuthTokenResponse = ({ body }: { body: unknown }) =>
	oauthTokenResponseSchema.parse(body);

export const parseOAuthScopeString = ({ scope }: { scope?: string }) =>
	scope?.split(/\s+/).filter(Boolean) ?? [];
