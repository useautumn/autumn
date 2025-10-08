// Old File

import { z } from "zod/v4";
import { OrgConfigSchema } from "../models/orgModels/orgConfig.js";

export const StripeConfigSchema = z.object({
	test_api_key: z.string(),
	live_api_key: z.string(),
	test_webhook_secret: z.string(),
	live_webhook_secret: z.string(),
	success_url: z.string(),
});

export const SvixConfigSchema = z.object({
	sandbox_app_id: z.string(),
	live_app_id: z.string(),
});

export const OrganizationSchema = z.object({
	id: z.string(),
	slug: z.string(),
	default_currency: z.string().default("usd"),
	stripe_connected: z.boolean().default(false),
	stripe_config: StripeConfigSchema.optional().nullable(),

	test_pkey: z.string(),
	live_pkey: z.string(),
	created_at: z.number(),

	svix_config: z.object({
		sandbox_app_id: z.string(),
		live_app_id: z.string(),
	}),

	config: OrgConfigSchema,
	api_version: z.number().nullish(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type StripeConfig = z.infer<typeof StripeConfigSchema>;
export type SvixConfig = z.infer<typeof SvixConfigSchema>;
