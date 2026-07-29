import { z } from "zod/v4";
import { UpdatePlanParamsV2Schema } from "../crud/updatePlanParamsV1.js";
import { PreviewUpdatePlanExpandEnum } from "./components/previewUpdatePlanExpand.js";

export const PreviewUpdatePlanDetailParamsSchema = z.object({
	include_versions: z.boolean().optional().meta({
		description:
			"Whether to include historical version previews in the response.",
	}),
	include_variants: z.boolean().optional().meta({
		description: "Whether to include variant previews in the response.",
	}),
	include_license_parents: z.boolean().optional().meta({
		description:
			"Whether to include parent plans that offer this plan as a license.",
	}),
});

export const PreviewUpdatePlanParamsV2Schema = UpdatePlanParamsV2Schema.extend({
	expand: z.array(PreviewUpdatePlanExpandEnum).optional().meta({
		description:
			"Fields to expand in the preview response. Use ['plan'] to include the resolved plan objects.",
	}),
}).extend(PreviewUpdatePlanDetailParamsSchema.shape);

export type PreviewUpdatePlanParamsV2 = z.infer<
	typeof PreviewUpdatePlanParamsV2Schema
>;
export type PreviewUpdatePlanParamsV2Input = z.input<
	typeof PreviewUpdatePlanParamsV2Schema
>;
