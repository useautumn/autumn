import {
	type AttachBillingContext,
	type AutumnBillingPlan,
	ErrCode,
	type FullProduct,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";

const hasPaidPlanLicense = ({ product }: { product: FullProduct }) =>
	(product.licenses ?? []).some(
		(planLicense) => !isFreeProduct({ product: planLicense.product }),
	);

const billingPlanPurchasesPaidLicense = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) =>
	(autumnBillingPlan.insertCustomerProducts ?? []).some((customerProduct) =>
		(customerProduct.customer_licenses ?? []).some(
			(customerLicense) =>
				customerLicense.paid_quantity > 0 &&
				customerLicense.planLicense !== null &&
				!isFreeProduct({
					product: customerLicense.planLicense.product,
				}),
		),
	);

export const handleStripeCheckoutLicenseErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { attachProduct, currentCustomerProduct } = billingContext;
	if (currentCustomerProduct) return;
	if (!isFreeProduct({ prices: attachProduct.prices })) return;
	if (!hasPaidPlanLicense({ product: attachProduct })) return;
	if (billingPlanPurchasesPaidLicense({ autumnBillingPlan })) return;

	throw new RecaseError({
		message:
			"Stripe Checkout requires at least one license quantity above its included quantity.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
