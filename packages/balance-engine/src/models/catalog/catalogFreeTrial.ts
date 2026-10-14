import { FreeTrialSchema } from "@autumn/shared";
import type { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

export const catalogFreeTrialSchema = FreeTrialSchema.extend({
	org_id: nonEmptyStringSchema,
	env: nonEmptyStringSchema,
});

export type CatalogFreeTrial = z.infer<typeof catalogFreeTrialSchema>;
