import { z } from "zod/v4";
import { ProcessorType } from "./genEnums";

/**
 * Customer-level Vercel processor
 * Stores installation-specific data for a customer's Vercel integration
 */
export const VercelProcessorSchema = z.object({
	installation_id: z.string(),
	access_token: z.string(),
	account_id: z.string(),
	custom_payment_method_id: z.string().optional(),
});

/**
 * Container for all external (non-Stripe) processors at customer level
 */
export const ExternalProcessorsSchema = z.object({
	vercel: VercelProcessorSchema.optional(),
});

/**
 * CustomerProduct-level Vercel processor
 * Stores installation-specific data for a customer product's Vercel integration
 */
export const VercelCusProductProcessorSchema = z.object({
	installation_id: z.string(),
	billing_plan_id: z.string(),
});

export type VercelCusProductProcessor = z.infer<
	typeof VercelCusProductProcessorSchema
>;
export const ExternalCusProductProcessorsSchema = z.object({
	vercel: VercelCusProductProcessorSchema.optional(),
});
export type ExternalCusProductProcessors = z.infer<
	typeof ExternalCusProductProcessorsSchema
>;

export enum VercelMarketplaceMode {
	Installation = "installation",
}

/**
 * Organization-level Vercel processor configuration
 * Stores OAuth app credentials and webhook URL
 */
export const VercelProcessorConfigSchema = z.object({
	client_integration_id: z.string(),
	client_secret: z.string(),
	sandbox_client_id: z.string().optional(),
	sandbox_client_secret: z.string().optional(),
	sandbox_webhook_url: z.string().optional(),
	webhook_url: z.string(),
	allowed_product_ids_live: z.array(z.string().min(1)).optional(),
	allowed_product_ids_sandbox: z.array(z.string().min(1)).optional(),
	custom_payment_method: z
		.object({
			live: z.string().optional(),
			sandbox: z.string().optional(),
		})
		.optional(),
	marketplace_mode: z
		.enum(VercelMarketplaceMode)
		.optional()
		.default(VercelMarketplaceMode.Installation),
	svix: z
		.object({
			live_id: z.string().optional(),
			sandbox_id: z.string().optional(),
		})
		.optional(),
});

export const UpsertVercelProcessorConfigSchema = z.object({
	client_integration_id: z.string().min(8).optional(),
	client_secret: z.string().min(8).optional(),
	webhook_url: z.string().min(14).optional(),
	sandbox_client_id: z.string().min(8).optional(),
	sandbox_client_secret: z.string().min(8).optional(),
	sandbox_webhook_url: z.string().min(14).optional(),
	allowed_product_ids_live: z.array(z.string().min(1)).optional(),
	allowed_product_ids_sandbox: z.array(z.string().min(1)).optional(),
	custom_payment_method: z
		.object({
			live: z.string().min(8).optional(),
			sandbox: z.string().min(8).optional(),
		})
		.optional(),
	marketplace_mode: z.enum(VercelMarketplaceMode).optional(),
});

/**
 * Organization-level RevenueCat processor configuration
 * Stores API key, project ID, and webhook secret
 */
export const RevenueCatProcessorConfigSchema = z.object({
	api_key: z.string(),
	sandbox_api_key: z.string().optional(),
	project_id: z.string().optional(),
	sandbox_project_id: z.string().optional(),
	webhook_secret: z.string(),
	sandbox_webhook_secret: z.string().optional(),
});

export const UpsertRevenueCatProcessorConfigSchema = z.object({
	api_key: z.string().min(8).optional(),
	sandbox_api_key: z.string().min(8).optional(),
	project_id: z.string().min(1).optional(),
	sandbox_project_id: z.string().min(1).optional(),
});

/**
 * Container for all processor configurations at organization level
 */
export const ProcessorConfigsSchema = z.object({
	vercel: VercelProcessorConfigSchema.optional(),
	revenuecat: RevenueCatProcessorConfigSchema.optional(),
});

export const ExternalSubIDSchema = z.object({
	type: z.enum(ProcessorType),
	id: z.string(),
});

export type ExternalSubID = z.infer<typeof ExternalSubIDSchema>;
// Export inferred types for backward compatibility
export type VercelProcessor = z.infer<typeof VercelProcessorSchema>;
export type ExternalProcessors = z.infer<typeof ExternalProcessorsSchema>;
export type VercelProcessorConfig = z.infer<typeof VercelProcessorConfigSchema>;
export type UpsertVercelProcessorConfig = z.infer<
	typeof UpsertVercelProcessorConfigSchema
>;
export type RevenueCatProcessorConfig = z.infer<
	typeof RevenueCatProcessorConfigSchema
>;
export type UpsertRevenueCatProcessorConfig = z.infer<
	typeof UpsertRevenueCatProcessorConfigSchema
>;
export type ProcessorConfigs = z.infer<typeof ProcessorConfigsSchema>;
