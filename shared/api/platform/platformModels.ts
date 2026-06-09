import { queryInteger, queryStringArray } from "@api/common/queryHelpers.js";
import { z } from "zod/v4";

/**
 * Query params for GET /platform/users endpoint
 */
export const ListPlatformUsersQuerySchema = z.object({
	limit: queryInteger({ min: 1, max: 100 }).default(10),

	offset: queryInteger({ min: 0 }).default(0),

	expand: queryStringArray(z.enum(["organizations"]))
		.optional()
		.describe(
			"Comma-separated list of fields to expand. Currently supports: organizations",
		),
});

export type ListPlatformUsersQuery = z.infer<
	typeof ListPlatformUsersQuerySchema
>;

/**
 * Platform organization schema
 */
export const ApiPlatformOrgSchema = z.object({
	slug: z.string().describe("Organization slug without the master org prefix"),
	name: z.string().describe("Organization name"),
	created_at: z
		.number()
		.describe("Timestamp of when org was created in milliseconds since epoch"),
});

export type ApiPlatformOrg = z.infer<typeof ApiPlatformOrgSchema>;

/**
 * Platform user schema
 */
export const ApiPlatformUserSchema = z.object({
	name: z.string().describe("User name"),
	email: z.string().describe("User email"),
	created_at: z
		.number()
		.describe("Timestamp of when user was created in milliseconds since epoch"),
	organizations: z
		.array(ApiPlatformOrgSchema)
		.optional()
		.describe("List of organizations created by the master org for this user"),
});

export type ApiPlatformUser = z.infer<typeof ApiPlatformUserSchema>;

/**
 * Response schema for GET /platform/users
 */
export const ListPlatformUsersResponseSchema = z.object({
	list: z.array(ApiPlatformUserSchema),
	total: z.number().describe("Total number of users returned"),
	limit: z.number().describe("Limit used in the query"),
	offset: z.number().describe("Offset used in the query"),
});

export type ListPlatformUsersResponse = z.infer<
	typeof ListPlatformUsersResponseSchema
>;

/**
 * Query params for GET /platform/orgs endpoint
 */
export const ListPlatformOrgsQuerySchema = z.object({
	limit: queryInteger({ min: 1, max: 100 }).default(10),

	offset: queryInteger({ min: 0 }).default(0),
});

export type ListPlatformOrgsQuery = z.infer<typeof ListPlatformOrgsQuerySchema>;

/**
 * Response schema for GET /platform/orgs
 */
export const ListPlatformOrgsResponseSchema = z.object({
	list: z.array(ApiPlatformOrgSchema),
	total: z.number().describe("Total number of organizations returned"),
	limit: z.number().describe("Limit used in the query"),
	offset: z.number().describe("Offset used in the query"),
});

export type ListPlatformOrgsResponse = z.infer<
	typeof ListPlatformOrgsResponseSchema
>;

/**
 * Request body for POST /platform.link_revenuecat
 */
export const LinkRevenueCatSchema = z.object({
	organization_slug: z.string().min(1),
	env: z.enum(["test", "live"]),
	project_name: z.string().min(1).max(255),
	redirect_url: z.string().url(),
});

export type LinkRevenueCat = z.infer<typeof LinkRevenueCatSchema>;

/**
 * Response schema for POST /platform.link_revenuecat
 */
export const LinkRevenueCatResponseSchema = z.object({
	oauth_url: z.string(),
});

export type LinkRevenueCatResponse = z.infer<
	typeof LinkRevenueCatResponseSchema
>;

/**
 * Request body for POST /platform.sync_revenuecat
 */
export const SyncRevenueCatSchema = z.object({
	organization_slug: z.string().min(1),
	env: z
		.enum(["test", "sandbox", "live"])
		.describe('"test" and "sandbox" both target the sandbox environment'),
	product_ids: z
		.array(z.string())
		.optional()
		.describe("Plans to push. Omit to sync every plan in the org/env."),
});

export type SyncRevenueCat = z.infer<typeof SyncRevenueCatSchema>;

/**
 * Per-app result of a single plan's sync.
 */
export const RevenueCatSyncAppResultSchema = z.object({
	app_id: z.string(),
	app_type: z.string(),
	product: z.enum(["created", "updated", "exists"]),
	store_push: z.enum(["pushed", "failed", "skipped"]).optional(),
	price: z.enum(["set", "skipped", "failed"]).optional(),
	message: z.string().optional(),
});

/**
 * Per-plan result of POST /platform.sync_revenuecat.
 */
export const RevenueCatSyncResultSchema = z.object({
	plan_id: z.string(),
	status: z.enum(["synced", "skipped", "error"]),
	store_identifier: z.string().optional(),
	apps: z.array(RevenueCatSyncAppResultSchema).optional(),
	message: z.string().optional(),
});

/**
 * Response schema for POST /platform.sync_revenuecat
 */
export const SyncRevenueCatResponseSchema = z.object({
	results: z.array(RevenueCatSyncResultSchema),
});

export type SyncRevenueCatResponse = z.infer<
	typeof SyncRevenueCatResponseSchema
>;

/**
 * Request body for POST /platform.get_revenuecat_keys
 */
export const GetRevenueCatKeysSchema = z.object({
	organization_slug: z.string().min(1),
	env: z
		.enum(["test", "sandbox", "live"])
		.describe('"test" and "sandbox" both target the sandbox environment'),
});

export type GetRevenueCatKeys = z.infer<typeof GetRevenueCatKeysSchema>;

/**
 * A RevenueCat public (SDK) API key.
 */
export const RevenueCatPublicApiKeySchema = z
	.object({
		id: z.string(),
		key: z.string().describe("The public SDK API key value"),
		environment: z.string().nullish().describe('e.g. "production" / "sandbox"'),
		app_id: z.string().nullish(),
		created_at: z.number().optional(),
	})
	.loose();

/**
 * Per-app public API keys for a managed org's RevenueCat project.
 */
export const RevenueCatAppKeysSchema = z.object({
	app_id: z.string(),
	app_type: z
		.string()
		.describe("RevenueCat store type, e.g. test_store / app_store / play_store"),
	name: z.string(),
	api_keys: z.array(RevenueCatPublicApiKeySchema),
});

/**
 * Response schema for POST /platform.get_revenuecat_keys
 */
export const GetRevenueCatKeysResponseSchema = z.object({
	apps: z.array(RevenueCatAppKeysSchema),
	oauth_access_token: z
		.string()
		.nullable()
		.describe(
			"Freshly-refreshed RevenueCat OAuth access token for the org (null for api-key orgs). The refresh token is never exposed — call this endpoint again for a new access token.",
		),
});

export type GetRevenueCatKeysResponse = z.infer<
	typeof GetRevenueCatKeysResponseSchema
>;
