import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { CusService } from "@/internal/customers/CusService.js";

/** One billing.updated tagged allocations_adjusted, for changes no plan event already carries. */
export const notifyAllocationsAdjusted = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> => {
	try {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		await sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: [],
			},
			originalFullCustomer: fullCustomer,
			allocationsAdjusted: true,
		});
	} catch (error) {
		ctx.logger.error("[notifyAllocationsAdjusted] failed", { error });
	}
};
