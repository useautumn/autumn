import { z } from "zod/v4";
import { RateLimitType } from "./rateLimitConfigs.js";

const RateLimitTypeSchema = z.enum(RateLimitType);

// String-keyed at the schema level (Zod's enum-keyed record demands every key
// be present, which defeats the "partial override" intent). The handler trusts
// the writer to send valid RateLimitType keys.
const OrgRateLimitOverrideSchema = z.object({
	limits: z.record(z.string(), z.number().int().min(0)).default({}),
});

export const RateLimitOverridesConfigSchema = z.object({
	orgs: z.record(z.string(), OrgRateLimitOverrideSchema).default({}),
});

export type OrgRateLimitOverride = {
	limits: Partial<Record<RateLimitType, number>>;
};
export type RateLimitOverridesConfig = {
	orgs: Record<string, OrgRateLimitOverride>;
};

export { RateLimitTypeSchema };
