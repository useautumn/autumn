import type { z } from "zod/v4";
import { DbOverageAllowedSchema } from "../../models/cusModels/billingControls/overageAllowed.js";

export const ApiOverageAllowedSchema = DbOverageAllowedSchema;

export type ApiOverageAllowed = z.infer<typeof ApiOverageAllowedSchema>;
