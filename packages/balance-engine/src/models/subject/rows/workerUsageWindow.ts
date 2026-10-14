import { UsageWindowSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { openSchema } from "../../common/openSchema.js";

export const workerUsageWindowSchema = openSchema({
	name: "workerUsageWindow",
	schema: UsageWindowSchema.extend({
		filter_key: z.string().nullable(),
	}),
});

export type WorkerUsageWindow = z.infer<typeof workerUsageWindowSchema>;
