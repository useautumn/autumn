import {
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductPaidRecurring,
	isCustomerProductRevertingTrial,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";

const isUnbilledPaidTrial = (customerProduct: FullCusProduct) =>
	!customerProduct.canceled &&
	!isCustomerProductRevertingTrial(customerProduct) &&
	!customerProduct.subscription_ids?.length &&
	isCustomerProductPaidRecurring(customerProduct);

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
	if (!isUnbilledPaidTrial(customerProduct)) return false;
	if (!(await customerHasPaymentMethod({ ctx, fullCustomer }))) return false;

	try {
		await billingActions.updateSubscription({
			ctx,
			params: {
				customer_id: fullCustomer.id || fullCustomer.internal_id,
				customer_product_id: customerProduct.id,
				entity_id: customerProductToEntityId({ fullCustomer, customerProduct }),
				version: customerProduct.product.version,
				redirect_mode: "if_required",
			},
			options: { skipAutumnCheckout: true },
		});
		return true;
	} catch (error) {
		ctx.logger.warn(
			`[productCron] could not bill trial ${customerProduct.id}, expiring it`,
			{ error },
		);
		return false;
	}
};
