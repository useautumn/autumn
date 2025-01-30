import { z } from "zod";

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

export const OrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  default_currency: z.string(),
  stripe_connected: z.boolean().default(false),
  stripe_config: StripeConfigSchema.optional().nullable(),

  config: z
    .object({
      free_trial_paid_to_paid: z.boolean().default(false),
    })
    .nullish(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type StripeConfig = z.infer<typeof StripeConfigSchema>;
export type MinOrg = z.infer<typeof MinOrgSchema>;
