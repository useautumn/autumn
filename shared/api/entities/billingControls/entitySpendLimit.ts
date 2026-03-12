import type { z } from "zod/v4";
import { EntitySpendLimitSchema } from "../../../models/cusModels/billingControls/entitySpendLimit.js";

export const ApiEntitySpendLimitSchema = EntitySpendLimitSchema;

export type ApiEntitySpendLimit = z.infer<typeof ApiEntitySpendLimitSchema>;
