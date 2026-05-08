import { z } from "zod/v4";
import { CustomizePlanOpSchema } from "./customizePlan/index.js";

/**
 * Ordered operations applied to each matched customer.
 *
 * Each operation sees the projected customer state produced by the
 * operations before it. This lets future `add_plan` operations insert a
 * cusProduct that a later `customize_plan` operation can target.
 */
export const CustomerOperationSchema = z.discriminatedUnion("type", [
	CustomizePlanOpSchema,
]);

export const CustomerOperationsSchema = z.array(CustomerOperationSchema).min(1);

export type CustomerOperation = z.infer<typeof CustomerOperationSchema>;

export type CustomerOperations = z.infer<typeof CustomerOperationsSchema>;
