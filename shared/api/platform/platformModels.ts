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
