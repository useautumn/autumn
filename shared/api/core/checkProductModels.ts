import { z } from "zod/v4";
import { CustomerDataSchema } from "../common/customerData.js";
import { EntityDataSchema } from "../common/entityData.js";

export const ProductScenarioSchema = z.enum([
	"scheduled",
	"active",
	"new",
	"renew",
	"upgrade",
	"downgrade",
	"cancel",
]);

// Check Product Schemas
export const CheckProductParamsSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer",
			example: "cus_123",
		}),
		product_id: z.string().meta({
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
		entity_data: EntityDataSchema.optional().meta({
			description: "Entity data to create the entity if it doesn't exist",
		}),
		with_preview: z.boolean().optional().meta({
			description: "Whether to include preview information in the response",
			example: true,
		}),
	})
	.meta({
		id: "CheckProductParams",
		description: "Parameters for checking product availability",
	});

export const CheckProductPreviewItemSchema = z
	.object({
		price: z.string().meta({
			description: "Formatted price string",
			example: "$10.00",
		}),
		description: z.string().meta({
			description: "Description of the item",
			example: "Base subscription",
		}),
		usage_model: z.enum(["prepaid", "pay_per_use"]).optional().meta({
			description: "The usage model for this item",
			example: "prepaid",
		}),
	})
	.meta({
		id: "CheckProductPreviewItem",
		description: "Individual item in product preview",
	});

export const CheckProductPreviewOptionSchema = z
	.object({
		feature_id: z.string().meta({
			description: "The ID of the feature",
			example: "api_calls",
		}),
		feature_name: z.string().meta({
			description: "The name of the feature",
			example: "API Calls",
		}),
		billing_units: z.number().meta({
			description: "Number of billing units",
			example: 1000,
		}),
		price: z.number().optional().meta({
			description: "Price per billing unit",
			example: 0.01,
		}),
		tiers: z
			.array(
				z.object({
					to: z.union([z.number(), z.string()]).meta({
						description: "Upper limit of this tier (can be 'inf' for infinite)",
						example: 1000,
					}),
					amount: z.number().meta({
						description: "Price amount for this tier",
						example: 10,
					}),
				}),
			)
			.optional()
			.meta({
				description: "Tiered pricing structure",
			}),
	})
	.meta({
		id: "CheckProductPreviewOption",
		description: "Feature option in product preview",
	});

export const CheckProductPreviewSchema = z
	.object({
		scenario: ProductScenarioSchema,
		product_id: z.string().meta({
			description: "The ID of the product",
			example: "pro_plan",
		}),
		product_name: z.string().meta({
			description: "The name of the product",
			example: "Pro Plan",
		}),
		recurring: z.boolean().meta({
			description: "Whether the product is recurring",
			example: true,
		}),
		error_on_attach: z.boolean().optional().meta({
			description: "Whether there would be an error attaching this product",
			example: false,
		}),
		next_cycle_at: z.number().optional().meta({
			description: "Timestamp of the next billing cycle",
			example: 1717000000000,
		}),
		current_product_name: z.string().optional().meta({
			description: "Name of the customer's current product",
			example: "Basic Plan",
		}),
		items: z.array(CheckProductPreviewItemSchema).optional().meta({
			description: "Individual items in the product",
		}),
		options: z.array(CheckProductPreviewOptionSchema).optional().meta({
			description: "Feature options available in the product",
		}),
		due_today: z
			.object({
				price: z.number().meta({
					description: "Amount due today",
					example: 10,
				}),
				currency: z.string().meta({
					description: "Currency code",
					example: "usd",
				}),
			})
			.optional()
			.meta({
				description: "Payment due today",
			}),
		due_next_cycle: z
			.object({
				price: z.number().meta({
					description: "Amount due next cycle",
					example: 50,
				}),
				currency: z.string().meta({
					description: "Currency code",
					example: "usd",
				}),
			})
			.optional()
			.meta({
				description: "Payment due in the next cycle",
			}),
	})
	.meta({
		id: "CheckProductPreview",
		description: "Preview information for a product check",
	});

export const CheckProductResultSchema = z
	.object({
		allowed: z.boolean().meta({
			description: "Whether the customer can attach the product",
			example: true,
		}),
		customer_id: z.string().meta({
			description: "The ID of the customer",
			example: "cus_123",
		}),
		product_id: z.string().meta({
			description: "The ID of the product",
			example: "pro_plan",
		}),
		entity_id: z.string().optional().meta({
			description: "The ID of the entity (if provided)",
			example: "entity_123",
		}),
		status: z.string().optional().meta({
			description: "Status code for the check result",
			example: "upgrade_available",
		}),
		preview: CheckProductPreviewSchema.optional().meta({
			description: "Preview information if with_preview was true",
		}),
	})
	.meta({
		id: "CheckProductResult",
		description: "Result of a product check",
	});

export type CheckProductParams = z.infer<typeof CheckProductParamsSchema>;
export type CheckProductResult = z.infer<typeof CheckProductResultSchema>;
export type CheckProductPreview = z.infer<typeof CheckProductPreviewSchema>;
export type CheckProductPreviewItem = z.infer<
	typeof CheckProductPreviewItemSchema
>;
export type CheckProductPreviewOption = z.infer<
	typeof CheckProductPreviewOptionSchema
>;
