import {
	CheckoutStatus,
	type DeferredAutumnBillingPlanData,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkoutRepo } from "@/internal/checkouts/repos/checkoutRepo";

/** The long-lived link that opened this pending plan, while it can still be paid. */
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
	const isOpen =
		checkout?.status === CheckoutStatus.Pending &&
		checkout.expires_at > Date.now();
	return isOpen ? checkout : undefined;
};
