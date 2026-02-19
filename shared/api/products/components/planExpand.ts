import { z } from "zod/v4";

export enum PlanExpand {
	ItemsFeature = "items.feature",
}

export const PlanExpandEnum = z.enum(PlanExpand);
