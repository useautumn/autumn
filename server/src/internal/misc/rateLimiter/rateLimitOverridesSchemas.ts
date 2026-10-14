import { z } from "zod/v4";
import { RateLimitType } from "./rateLimitConfigs.js";

const RateLimitTypeSchema = z.enum(RateLimitType);

const RateLimitEndpointSchema = z
	.string()
	.regex(
		/^(GET|POST|PUT|PATCH|DELETE) \/v1(\/[\w.:-]+)+$/,
		'Expected "METHOD /v1/path", e.g. "POST /v1/entities.delete"',
	);

const EndpointRateLimitOverrideSchema = z.object({
	limit: z.number().int().min(0),
	windowMs: z.number().int().positive(),
});

// String-keyed at the schema level (Zod's enum-keyed record demands every key
const OrgRateLimitOverrideSchema = z.object({
	limits: z.record(z.string(), z.number().int().min(0)).default({}),
	endpoints: z
		.record(RateLimitEndpointSchema, EndpointRateLimitOverrideSchema)
		.optional(),
});

export const RateLimitOverridesConfigSchema = z.object({
	orgs: z.record(z.string(), OrgRateLimitOverrideSchema).default({}),
});

export type EndpointRateLimitOverride = z.infer<
	typeof EndpointRateLimitOverrideSchema
>;
export type OrgRateLimitOverride = {
	limits: Record<string, number>;
	endpoints?: Record<string, EndpointRateLimitOverride>;
};
export type RateLimitOverridesConfig = {
	orgs: Record<string, OrgRateLimitOverride>;
};

export { RateLimitTypeSchema };
