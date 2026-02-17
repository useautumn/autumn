import { z } from "zod/v4";

export const DeletePlanV2BodySchema = z.object({
	plan_id: z.string().nonempty(),
	all_versions: z.boolean().default(false).optional(),
});
