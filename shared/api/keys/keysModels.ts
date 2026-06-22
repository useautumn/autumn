import { z } from "zod/v4";

/**
 * Per-customer JWT ("customer key") request/response models. Shared between the
 * server handlers (request validation) and the OpenAPI contract (SDK + docs).
 */

export const MintKeyParamsSchema = z.object({
	customer_id: z.string().describe("The customer to mint a token for."),
	indefinite: z
		.boolean()
		.optional()
		.describe(
			"If true, mint a non-expiring access token (no refresh token). Revoke via keys.revoke.",
		),
});

export const MintKeyResponseSchema = z.object({
	access_token: z
		.string()
		.describe(
			"Access token (1h, or non-expiring if indefinite), prefixed `am_jwt_`.",
		),
	refresh_token: z
		.string()
		.optional()
		.describe("Rotating refresh token (24h). Omitted for indefinite tokens."),
	expires_at: z
		.number()
		.nullable()
		.describe(
			"Access-token expiry, ms since epoch. null for indefinite tokens.",
		),
	refresh_expires_at: z
		.number()
		.optional()
		.describe(
			"Refresh-token expiry, ms since epoch. Omitted for indefinite tokens.",
		),
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
