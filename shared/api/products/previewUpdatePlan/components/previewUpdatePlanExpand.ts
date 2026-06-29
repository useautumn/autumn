import { z } from "zod/v4";

export enum PreviewUpdatePlanExpand {
	Plan = "plan",
}

export const PreviewUpdatePlanExpandEnum = z
	.enum(PreviewUpdatePlanExpand)
	.meta({
		title: "PreviewUpdatePlanExpand",
	});
