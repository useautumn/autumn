import {
	CheckoutStatus,
	type DeferredAutumnBillingPlanData,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";

/** The still-open long-lived link that opened this pending plan, if any. */
export const getPendingPlanLongLivedCheckout = async ({
	ctx,
	deferredData,
}: {
	ctx: AutumnContext;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const checkoutId = deferredData.billingContext.longLivedCheckout?.id;
	if (!checkoutId) return;

	const checkout = await checkoutRepo.get({ db: ctx.db, id: checkoutId });
	return checkout?.status === CheckoutStatus.Pending ? checkout : undefined;
};
