import { CusProductStatus, type FullSubject } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { isThresholdBillingProduct } from "@/internal/balances/thresholdBilling/isThresholdBillingProduct.js";

export const getCheckSubject = ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): FullSubject => {
	const shouldBlockPastDue = (
		customerProduct: FullSubject["customer_products"][number],
	) =>
		customerProduct.status === CusProductStatus.PastDue &&
		(ctx.org.config.block_overdue_entitlements ||
			(isThresholdBillingProduct({ customerProduct }) &&
				!customerProduct.product.config?.ignore_past_due));

	if (!fullSubject.customer_products.some(shouldBlockPastDue)) {
		return fullSubject;
	}

	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.filter(
			(customerProduct) => !shouldBlockPastDue(customerProduct),
		),
	};
};
