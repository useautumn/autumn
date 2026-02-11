import { ApiProductSchema } from "@api/products/previousVersions/apiProduct";
import { z } from "zod/v4";

// Check Feature Preview Schemas
export const CheckFeaturePreviewSchema = z.object({
	scenario: z.enum(["usage_limit", "feature_flag"]),
	title: z.string(),
	message: z.string(),
	feature_id: z.string(),
	feature_name: z.string(),
	products: z.array(ApiProductSchema),
});
