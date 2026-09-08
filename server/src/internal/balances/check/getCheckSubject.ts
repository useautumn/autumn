import { CusProductStatus, type FullSubject } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

export const getCheckSubject = ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): FullSubject => {
	const thresholdProductIds = new Set(
		fullSubject.customer_products
			.filter((customerProduct) =>
				customerProduct.customer_prices.some(
					(customerPrice) =>
						"threshold_billing" in customerPrice.price.config &&
						Boolean(customerPrice.price.config.threshold_billing),
				),
			)
			.map((customerProduct) => customerProduct.id),
	);
	const thresholdBillingProduct = (
		customerProduct: FullSubject["customer_products"][number],
	) => thresholdProductIds.has(customerProduct.id);
	const shouldBlock = (
		customerProduct: FullSubject["customer_products"][number],
	) =>
		customerProduct.status === CusProductStatus.PastDue &&
		!customerProduct.product.config?.ignore_past_due &&
		(ctx.org.config.block_overdue_entitlements ||
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
		return fullSubject;

	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.filter(
			(customerProduct) =>
				!shouldBlock(customerProduct) &&
				(customerProduct.product.config?.allow_overdue_entitlements ||
					customerProduct.status !== CusProductStatus.PastDue),
		),
	};
};
