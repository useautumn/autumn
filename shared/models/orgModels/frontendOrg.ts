import { z } from "zod/v4";

export const FrontendOrgSchema = z.object({
	id: z.string(),
	name: z.string(),
	logo: z.string().nullable(),
	slug: z.string(),

	success_url: z.string(),
	default_currency: z.string(),
	created_at: z.number(),
	test_pkey: z.string().nullable(),
	live_pkey: z.string().nullable(),

	stripe_connection: z.string(),
	master: z
		.object({
			id: z.string(),
			name: z.string(),
			slug: z.string(),
		})
		.nullable(),
	through_master: z.boolean(),
	onboarded: z.boolean(),
	deployed: z.boolean(),
});

export type FrontendOrg = z.infer<typeof FrontendOrgSchema>;
