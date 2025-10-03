import { EntityResponseSchema } from "@models/cusModels/entityModels/entityResModels.js";
import type { z } from "zod/v4";

export const APIEntitySchema = EntityResponseSchema.meta({
	id: "Entity",
	description: "Entity object returned by the API",
});
export type APIEntity = z.infer<typeof APIEntitySchema>;
