import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { job } from "../lib/job/job.js";

/** The worker re-reads the customer and re-derives the decision, so the payload is only the address. */
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
