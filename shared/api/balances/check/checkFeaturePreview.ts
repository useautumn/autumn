import { z } from "zod/v4";
import { ApiProductSchema } from "../../models.js";

// Check Feature Preview Schemas
export const CheckFeaturePreviewSchema = z.object({
	scenario: z.enum(["usage_limit", "feature_flag"]),
	title: z.string(),
	message: z.string(),
	feature_id: z.string(),
	feature_name: z.string(),
	products: z.array(ApiProductSchema),
});
