import { EntityDataSchema } from "@api/common/entityData.js";
import { APIProductSchema } from "@api/products/apiProduct.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../common/customerData.js";
import { CoreCusFeatureSchema } from "../customers/cusFeatures/apiCusFeature.js";

// Check Feature Enums
export const CheckFeatureScenarioSchema = z
	.enum(["usage_limit", "feature_flag"])
	.meta({
		id: "CheckFeatureScenario",
		description: "Scenario type for feature check",
	});

export const ProductScenarioSchema = z
	.enum([
		"scheduled",
		"active",
		"new",
		"renew",
		"upgrade",
		"downgrade",
		"cancel",
	])
	.meta({
		id: "ProductScenario",
		description: "Scenario type for product attachment",
	});

// Check Feature Schemas
export const CheckParamsSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer to check",
			example: "cus_123",
		}),
		feature_id: z.string().optional().meta({
			description: "The ID of the feature to check access for",
			example: "api_calls",
		}),
		product_id: z.string().optional().meta({
			description: "The ID of the product to check",
			example: "pro_plan",
		}),
		entity_id: z.string().optional().meta({
			description: "The ID of the entity (optional)",
			example: "entity_123",
		}),
		customer_data: CustomerDataSchema.optional().meta({
			description:
				"Customer data to create or update the customer if they don't exist",
		}),
		required_balance: z.number().optional().meta({
			description: "The required balance for the check",
			example: 1,
		}),
		send_event: z.boolean().optional().meta({
			description: "Whether to send a usage event if allowed",
			example: true,
		}),
		with_preview: z.boolean().optional().meta({
			description: "Whether to include preview information in the response",
			example: true,
		}),
		entity_data: EntityDataSchema.optional().meta({
			description: "Entity data to create the entity if it doesn't exist",
		}),
	})
	.meta({
		id: "CheckParams",
		description: "Parameters for checking feature or product access",
	});

// Check Feature Preview Schemas
export const CheckFeaturePreviewSchema = z
	.object({
		scenario: CheckFeatureScenarioSchema.meta({
			description: "The scenario type for this feature preview",
			example: "usage_limit",
		}),
		title: z.string().meta({
			description: "Title for the preview message",
			example: "Usage Limit Reached",
		}),
		message: z.string().meta({
			description: "Detailed message explaining the check result",
			example: "You've reached your usage limit. Upgrade to continue.",
		}),
		feature_id: z.string().meta({
			description: "The ID of the feature",
			example: "api_calls",
		}),
		feature_name: z.string().meta({
			description: "The name of the feature",
			example: "API Calls",
		}),
		products: z.array(APIProductSchema).meta({
			description: "Available products that include this feature",
		}),
	})
	.meta({
		id: "CheckFeaturePreview",
		description: "Preview information for a feature check",
	});

export const CheckResultSchema = z
	.object({
		allowed: z.boolean().meta({
			description: "Whether the customer is allowed to use the feature",
			example: true,
		}),
		customer_id: z.string().meta({
			description: "The ID of the customer",
			example: "cus_123",
		}),
		feature_id: z.string().meta({
			description: "The ID of the feature checked",
			example: "api_calls",
		}),
		entity_id: z.string().nullish().meta({
			description: "The ID of the entity (if provided)",
			example: "entity_123",
		}),
		required_balance: z.number().meta({
			description: "The required balance for this check",
			example: 1,
		}),
		code: z.string().meta({
			description: "Response code indicating the result",
			example: "allowed",
		}),
		preview: CheckFeaturePreviewSchema.optional().meta({
			description: "Preview information if with_preview was true",
		}),
	})
	.extend(CoreCusFeatureSchema.shape)
	.meta({
		id: "CheckResult",
		description: "Result of a feature check",
	});

// Export Types
export type CheckParams = z.infer<typeof CheckParamsSchema>;
export type CheckResponse = z.infer<typeof CheckResultSchema>;
export type CheckFeatureScenario = z.infer<typeof CheckFeatureScenarioSchema>;
// export type CheckFeaturePreview = z.infer<typeof CheckFeaturePreviewSchema>;
export type ProductScenario = z.infer<typeof ProductScenarioSchema>;
