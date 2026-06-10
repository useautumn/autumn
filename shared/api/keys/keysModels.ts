import { z } from "zod/v4";

/**
 * Per-customer JWT ("customer key") request/response models. Shared between the
 * server handlers (request validation) and the OpenAPI contract (SDK + docs).
 */

export const MintKeyParamsSchema = z.object({
	customer_id: z.string().describe("The customer to mint a token for."),
});

export const MintKeyResponseSchema = z.object({
	access_token: z
		.string()
		.describe("Short-lived access token (1h), prefixed `am_jwt_`."),
	refresh_token: z
		.string()
		.describe("Rotating refresh token (24h), prefixed `am_jwt_`."),
	expires_at: z.number().describe("Access-token expiry, ms since epoch."),
	refresh_expires_at: z
		.number()
		.describe("Refresh-token expiry, ms since epoch."),
});

export const RefreshKeyParamsSchema = z
	.object({})
	.describe(
		"No body. The refresh token is supplied as the Bearer credential; the response is a freshly rotated access + refresh pair.",
	);

export const RefreshKeyResponseSchema = MintKeyResponseSchema;

export const RevokeKeyParamsSchema = z.object({
	customer_id: z
		.string()
		.describe(
			"The customer whose tokens (every outstanding access + refresh token) should be revoked.",
		),
});

export const RevokeKeyResponseSchema = z.object({
	revoked: z.literal(true),
});

export type MintKeyParams = z.infer<typeof MintKeyParamsSchema>;
export type MintKeyResponse = z.infer<typeof MintKeyResponseSchema>;
export type RevokeKeyParams = z.infer<typeof RevokeKeyParamsSchema>;
