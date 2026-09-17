import { CustomerSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The customers columns a command reads: who the subject is, the config that shapes selection, and the controls that cap it. */
export const workerCustomerSchema = CustomerSchema.pick({
	internal_id: true,
	id: true,
	config: true,
	spend_limits: true,
	overage_allowed: true,
	usage_limits: true,
}).strict();

export type WorkerCustomer = z.infer<typeof workerCustomerSchema>;
