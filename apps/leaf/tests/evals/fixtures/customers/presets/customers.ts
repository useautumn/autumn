import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import { baseCustomer } from "../base/baseCustomer.js";
import { subscriptions } from "./subscriptions.js";

type CustomerArgs = Parameters<typeof baseCustomer>[0];

/** Customer presets for common eval scenarios; compose subscriptions explicitly. */
export const customers = {
	active: (args?: CustomerArgs): BaseApiCustomerV5 => baseCustomer(args),
	withPlan: ({
		plan,
		...args
	}: CustomerArgs & { plan: ApiPlanV1 }): BaseApiCustomerV5 =>
		baseCustomer({
			...args,
			subscriptions: [subscriptions.active({ plan })],
		}),
} as const;
