import { VercelMarketplaceMode } from "@models/genModels/processorSchemas";
import { z } from "zod/v4";
import { CustomButtonSchema } from "./customButton";
import { IdempotencyConfigSchema } from "./idempotencyConfig";
import { OrgConfigSchema } from "./orgConfig";

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
	stripe_secret_key_connected: z.boolean(),
	stripe_oauth_connected: z.boolean(),
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
	config: OrgConfigSchema,
	idempotency_config: IdempotencyConfigSchema.nullable(),
	custom_buttons: z.array(CustomButtonSchema),
	redis_config: z
		.object({
			host: z.string(),
			migrationPercent: z.number(),
		})
		.nullable(),
	processor_configs: z.object({
		vercel: z.object({
			connected: z.boolean(),
			client_integration_id: z.string().optional(),
			client_secret: z.string().optional(),
			webhook_url: z.string().optional(),
			custom_payment_method: z.string().optional(),
			marketplace_mode: z.enum(VercelMarketplaceMode).optional(),
			allowed_product_ids_live: z.array(z.string()).optional(),
			allowed_product_ids_sandbox: z.array(z.string()).optional(),
		}),
		revenuecat: z.object({
			connected: z.boolean(),
			api_key: z.string().optional(),
			sandbox_api_key: z.string().optional(),
			project_id: z.string().optional(),
			sandbox_project_id: z.string().optional(),
			webhook_secret: z.string().optional(),
			sandbox_webhook_secret: z.string().optional(),
		}),
	}),
});

export type FrontendOrg = z.infer<typeof FrontendOrgSchema>;
