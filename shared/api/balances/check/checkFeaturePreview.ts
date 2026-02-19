import { ApiProductSchema } from "@api/products/previousVersions/apiProduct";
import { z } from "zod/v4";

// Check Feature Preview Schemas
export const CheckFeaturePreviewSchema = z.object({
	scenario: z.enum(["usage_limit", "feature_flag"]).meta({
		description:
			"The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan.",
	}),
	title: z.string().meta({
		description: "A title suitable for displaying in a paywall or upgrade modal.",
	}),
	message: z.string().meta({
		description: "A message explaining why access was denied.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature that was checked.",
	}),
	feature_name: z.string().meta({
		description: "The display name of the feature.",
	}),
	products: z.array(ApiProductSchema).meta({
		description:
			"Products that would grant access to this feature. Use to display upgrade options.",
	}),
});
