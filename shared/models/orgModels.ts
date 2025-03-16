import { z } from "zod";
import { OrgConfigSchema } from "./orgModels/orgConfigModels.js";

export const MinOrgSchema = z.object({
  id: z.string(),
  slug: z.string(),
});

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
  default_currency: z.string(),
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
});

export const FrontendOrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  default_currency: z.string(),
  stripe_connected: z.boolean().default(false),
  created_at: z.number(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type StripeConfig = z.infer<typeof StripeConfigSchema>;
export type MinOrg = z.infer<typeof MinOrgSchema>;
export type FrontendOrganization = z.infer<typeof FrontendOrganizationSchema>;
