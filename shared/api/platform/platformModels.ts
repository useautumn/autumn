import { queryStringArray } from "@api/common/queryHelpers.js";
import { z } from "zod/v4";

/**
 * Query params for GET /platform/users endpoint
 */
export const ListPlatformUsersQuerySchema = z.object({
	limit: z
		.number()
		.int({ error: "limit must be an integer" })
		.min(1, { error: "limit must be at least 1" })
		.max(100, { error: "limit must be at most 100" })
		.default(10),

	offset: z
		.number({ error: "offset must be a number" })
		.int({ error: "offset must be an integer" })
		.min(0, { error: "offset must be at least 0" })
		.default(0),

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
