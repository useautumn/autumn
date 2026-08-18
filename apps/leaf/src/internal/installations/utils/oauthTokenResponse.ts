import { z } from "zod";

const oauthTokenResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1).optional(),
	expires_in: z.number().optional(),
	scope: z.string().optional(),
});

export const parseOAuthTokenResponse = ({ body }: { body: unknown }) =>
	oauthTokenResponseSchema.parse(body);

export const parseOAuthScopeString = ({ scope }: { scope?: string }) =>
	scope?.split(/\s+/).filter(Boolean) ?? [];
