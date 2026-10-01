import { fullSubjectToFullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";

/** One billing.updated tagged allocations_adjusted, for changes no plan event already carries. */
export const notifyAllocationsAdjusted = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<void> => {
	try {
		// Read from primary: this runs right after the allocation write.
		const fullSubject = await getFullSubject({
			ctx,
			customerId,
			readFrom: "primary",
		});
		if (!fullSubject) return;
		const fullCustomer = fullSubjectToFullCustomer({ fullSubject });
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
