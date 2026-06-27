import { UpdatePlanParamsV2Schema } from "../crud/updatePlanParamsV1.js";
import { z } from "zod/v4";
import { PreviewUpdatePlanExpandEnum } from "./components/previewUpdatePlanExpand.js";

export const PreviewUpdatePlanParamsV2Schema = UpdatePlanParamsV2Schema.extend({
	expand: z.array(PreviewUpdatePlanExpandEnum).optional().meta({
		description:
			"Fields to expand in the preview response. Use ['plan'] to include the resolved plan objects.",
	}),
});

export type PreviewUpdatePlanParamsV2 = z.infer<
	typeof PreviewUpdatePlanParamsV2Schema
>;
export type PreviewUpdatePlanParamsV2Input = z.input<
	typeof PreviewUpdatePlanParamsV2Schema
>;
