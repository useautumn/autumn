import { z } from "zod";

export const FrontendOrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  logo: z.string().nullable(),
  slug: z.string(),
  default_currency: z.string(),
  stripe_connected: z.boolean(),
  created_at: z.number(),
  test_pkey: z.string().nullable(),
  live_pkey: z.string().nullable(),
});

export type FrontendOrg = z.infer<typeof FrontendOrgSchema>;
