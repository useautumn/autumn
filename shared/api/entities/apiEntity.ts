import { EntityResponseSchema } from "@models/cusModels/entityModels/entityResModels.js";
import type { z } from "zod/v4";

// Base schema without .meta() to avoid side effects during imports
export const APIEntitySchema = EntityResponseSchema;
export type APIEntity = z.infer<typeof APIEntitySchema>;
