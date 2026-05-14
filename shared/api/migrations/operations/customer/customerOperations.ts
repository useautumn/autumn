import { z } from "zod/v4";
import { AddPlanOpSchema } from "./addPlan/index.js";
import { UpdatePlanOpSchema } from "./updatePlan/index.js";

/**
 * Ordered operations applied to each matched customer.
 *
 * Each operation sees the projected customer state produced by the
 * operations before it. `add_plan` inserts a cusProduct that a later
 * `update_plan` operation can target.
 *
 * Execution order: add_plan → update_plan (regardless of array order).
 */
export const CustomerOperationSchema = z.discriminatedUnion("type", [
	AddPlanOpSchema,
	UpdatePlanOpSchema,
]);

export const CustomerOperationsSchema = z.array(CustomerOperationSchema).min(1);

export type CustomerOperation = z.infer<typeof CustomerOperationSchema>;

export type CustomerOperations = z.infer<typeof CustomerOperationsSchema>;
