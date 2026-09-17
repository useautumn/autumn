import { CustomerSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The customers columns a command reads: who the subject is, and the config that shapes selection. */
export const workerCustomerSchema = CustomerSchema.pick({
	internal_id: true,
	id: true,
	config: true,
}).strict();

export type WorkerCustomer = z.infer<typeof workerCustomerSchema>;
