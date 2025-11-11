import { z } from "zod/v4";

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
	Resource = "resource",
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
});

export const UpsertVercelProcessorConfigSchema = z.object({
	client_integration_id: z.string().min(8).optional(),
	client_secret: z.string().min(8).optional(),
	webhook_url: z.string().min(14).optional(),
	sandbox_client_id: z.string().min(8).optional(),
	sandbox_client_secret: z.string().min(8).optional(),
	sandbox_webhook_url: z.string().min(14).optional(),
	custom_payment_method: z
		.object({
			live: z.string().min(8).optional(),
			sandbox: z.string().min(8).optional(),
		})
		.optional(),
	marketplace_mode: z.enum(VercelMarketplaceMode).optional(),
});

/**
 * Container for all processor configurations at organization level
 */
export const ProcessorConfigsSchema = z.object({
	vercel: VercelProcessorConfigSchema.optional(),
});

// Export inferred types for backward compatibility
export type VercelProcessor = z.infer<typeof VercelProcessorSchema>;
export type ExternalProcessors = z.infer<typeof ExternalProcessorsSchema>;
export type VercelProcessorConfig = z.infer<typeof VercelProcessorConfigSchema>;
export type UpsertVercelProcessorConfig = z.infer<
	typeof UpsertVercelProcessorConfigSchema
>;
export type ProcessorConfigs = z.infer<typeof ProcessorConfigsSchema>;
