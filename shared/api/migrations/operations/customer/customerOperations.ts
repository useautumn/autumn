import { z } from "zod/v4";
import { AddPlanOpSchema } from "./addPlan/index.js";
import { UpdatePlanOpSchema } from "./updatePlan/index.js";

export const CustomerOperationSchema = z.discriminatedUnion("type", [
	AddPlanOpSchema,
	UpdatePlanOpSchema,
]);

export const CustomerOperationsSchema = z.array(CustomerOperationSchema).min(1);

export type CustomerOperation = z.infer<typeof CustomerOperationSchema>;

export type CustomerOperations = z.infer<typeof CustomerOperationsSchema>;
