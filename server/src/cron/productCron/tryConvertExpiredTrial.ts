import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";

const customerHasPaymentMethod = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const paymentMethod = await getCusPaymentMethod({
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripeId: fullCustomer.processor?.id,
	});
	return Boolean(paymentMethod);
};

const customerProductToEntityId = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	const entity = fullCustomer.entities?.find(
		(candidate) => candidate.internal_id === customerProduct.internal_entity_id,
	);
	return entity ? (entity.id ?? entity.internal_id) : undefined;
};

/**
 * Bills a lapsed no-card trial into Stripe when the customer has a card on file.
 * Returns false when there is nothing to bill or the charge was rejected, so the caller expires it.
 */
export const tryConvertExpiredTrial = async ({
	ctx,
	fullCustomer,
	customerProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): Promise<boolean> => {
	if (
		customerProduct.canceled ||
		!isCustomerProductAutumnManagedTrial(customerProduct)
	)
		return false;
	if (!(await customerHasPaymentMethod({ ctx, fullCustomer }))) return false;

	try {
		const { billingResult } = await billingActions.updateSubscription({
			ctx,
			params: {
				customer_id: fullCustomer.id || fullCustomer.internal_id,
				customer_product_id: customerProduct.id,
				entity_id: customerProductToEntityId({ fullCustomer, customerProduct }),
				version: customerProduct.product.version,
				redirect_mode: "if_required",
			},
			contextOverride: { paymentBehaviorIntent: "error_if_incomplete" },
			options: { skipAutumnCheckout: true },
		});
		// Billed only when a live subscription came back, not a deferred plan awaiting a failed payment.
		return (
			billingResult?.stripe.stripeSubscription !== undefined &&
			!billingResult.stripe.deferred
		);
	} catch (error) {
		ctx.logger.warn(
			`[productCron] could not bill trial ${customerProduct.id}, expiring it`,
			{ error },
		);
		return false;
	}
};
