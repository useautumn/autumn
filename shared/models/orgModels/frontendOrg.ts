import { VercelMarketplaceMode } from "@models/genModels/processorSchemas.js";
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
	processor_configs: z.object({
		vercel: z.object({
			connected: z.boolean(),
			/** These are all masked in the frontend
			 * - e.g oac_******3a
			 */
			client_integration_id: z.string().optional(),
			client_secret: z.string().optional(),
			webhook_url: z.string().optional(),
			custom_payment_method: z.string().optional(),
			marketplace_mode: z.enum(VercelMarketplaceMode).optional(),
		}),
		revenuecat: z.object({
			connected: z.boolean(),
			/** These API Keys are also masked in the frontend
			 * - e.g test_******3a
			 */
			api_key: z.string().optional(),
			sandbox_api_key: z.string().optional(),
			webhook_secret: z.string().optional(),
			sandbox_webhook_secret: z.string().optional(),
		}),
	}),
});

export type FrontendOrg = z.infer<typeof FrontendOrgSchema>;
