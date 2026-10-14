import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { job } from "../lib/job/job.js";

export const autoTopupJob = job({
	name: "auto-top-up",
	queue: "general",
	payload: z.object({
		orgId: z.string(),
		env: z.enum(AppEnv),
		customerId: z.string(),
		featureId: z.string(),
	}),
});
