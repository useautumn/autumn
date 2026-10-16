import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeCreateCustomerPlan } from "./compute/computeCreateCustomerPlan.js";
import { setupCreateCustomer } from "./setup/setupCreateCustomer.js";

/** The customer `createCustomerWithDefaults` would create, default plans included, with nothing saved. */
export const previewCustomerWithDefaults = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullCustomer> => {
	const context = await setupCreateCustomer({ ctx, customerId });
	computeCreateCustomerPlan({ ctx, context });
	return context.fullCustomer;
};
