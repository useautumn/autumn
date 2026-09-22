import { CustomerSchema } from "@autumn/shared";
import type { z } from "zod/v4";

/** The customers columns a command or a log reader needs: who the subject is, the config that shapes selection, the controls that cap it, and the alerts on it. */
export const workerCustomerSchema = CustomerSchema.pick({
	internal_id: true,
	id: true,
	config: true,
	spend_limits: true,
	overage_allowed: true,
	usage_limits: true,
	usage_alerts: true,
}).strict();

export type WorkerCustomer = z.infer<typeof workerCustomerSchema>;
