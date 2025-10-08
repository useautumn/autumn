import { z } from "zod/v4";

export const FrontendOrgSchema = z.object({
	id: z.string(),
	name: z.string(),
	logo: z.string().nullable(),
	slug: z.string(),

	success_url: z.string(),
	default_currency: z.string(),
	stripe_connected: z.boolean(),
	created_at: z.number(),
	test_pkey: z.string().nullable(),
	live_pkey: z.string().nullable(),
});

export type FrontendOrg = z.infer<typeof FrontendOrgSchema>;
