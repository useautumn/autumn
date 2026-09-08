import { CusProductStatus, type FullSubject } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

export const getCheckSubject = ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): FullSubject => {
	const isThresholdProduct = (
		customerProduct: FullSubject["customer_products"][number],
	) => customerProduct.customer_prices.some((customerPrice) =>
		Boolean(customerPrice.price.config.threshold_billing),
	);
	const shouldBlockPastDue = (
		customerProduct: FullSubject["customer_products"][number],
	) =>
		customerProduct.status === CusProductStatus.PastDue &&
		!customerProduct.product.config?.ignore_past_due &&
		(ctx.org.config.block_overdue_entitlements ||
<<<<<<< HEAD
			isThresholdProduct(customerProduct));

	if (!fullSubject.customer_products.some(shouldBlockPastDue))
=======
			thresholdBillingProduct(customerProduct) ||
			customerProduct.status === CusProductStatus.PastDue);

	if (
		!ctx.org.config.block_overdue_entitlements &&
		!fullSubject.customer_products.some(
			(customerProduct) =>
				thresholdBillingProduct(customerProduct) ||
				(customerProduct.status === CusProductStatus.PastDue &&
					!customerProduct.product.config?.ignore_past_due),
		)
	)
>>>>>>> 67ea8ba17e (Block threshold usage after failed payment)
		return fullSubject;

	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.filter(
<<<<<<< HEAD
			(customerProduct) =>
				!shouldBlockPastDue(customerProduct) &&
				(customerProduct.product.config?.allow_overdue_entitlements ||
					customerProduct.status !== CusProductStatus.PastDue),
=======
			(customerProduct) =>
				!shouldBlock(customerProduct) &&
				(customerProduct.product.config?.allow_overdue_entitlements ||
					customerProduct.status !== CusProductStatus.PastDue),
>>>>>>> 7c01d44532 (Implement threshold billing through auto top-up flow)
		),
	};
};
