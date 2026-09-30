import {
	type CreateScheduleBillingContext,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductCanceling,
	isProductPaidAndRecurring,
	type MultiAttachProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isUnchangedCustomerProduct } from "../utils/isUnchangedCustomerProduct";

export type KeptCustomerProduct = {
	customerProduct: FullCusProduct;
	productContext: MultiAttachProductContext;
};

const RUNNING_STATUSES = [CusProductStatus.Active, CusProductStatus.Trialing];

const runsUncanceled = (customerProduct: FullCusProduct) =>
	RUNNING_STATUSES.includes(customerProduct.status) &&
	!isCustomerProductCanceling(customerProduct);

/** A replacement continues kept plans' cycle only after a cancelled (paid-up) subscription, with no other paid plan and no requested anchor. */
const canContinueKeptCycle = ({
	billingContext,
	changedProductContexts,
}: {
	billingContext: CreateScheduleBillingContext;
	changedProductContexts: MultiAttachProductContext[];
}) => {
	const { replacedStripeSubscription, requestedBillingCycleAnchor } =
		billingContext;
	if (!replacedStripeSubscription) return true;

	return (
		replacedStripeSubscription.status === "canceled" &&
		requestedBillingCycleAnchor === undefined &&
		!changedProductContexts.some(({ fullProduct }) =>
			isProductPaidAndRecurring(fullProduct),
		)
	);
};

/** Splits the immediate phase into plans already running exactly as requested, which stay untouched, and the rest. */
export const partitionUnchangedCustomerProducts = ({
	ctx,
	billingContext,
	currentRecurringCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	currentRecurringCustomerProducts: FullCusProduct[];
}) => {
	const keptCustomerProducts: KeptCustomerProduct[] = [];
	const changedProductContexts: MultiAttachProductContext[] = [];

	for (const productContext of billingContext.productContexts) {
		const unchangedCustomerProduct = currentRecurringCustomerProducts.find(
			(customerProduct) =>
				runsUncanceled(customerProduct) &&
				!keptCustomerProducts.some(
					(kept) => kept.customerProduct.id === customerProduct.id,
				) &&
				isUnchangedCustomerProduct({
					ctx,
					customerProduct,
					productContext,
					internalEntityId: productContext.fullCustomer.entity?.internal_id,
				}),
		);

		if (unchangedCustomerProduct) {
			keptCustomerProducts.push({
				customerProduct: unchangedCustomerProduct,
				productContext,
			});
		} else {
			changedProductContexts.push(productContext);
		}
	}

	if (!canContinueKeptCycle({ billingContext, changedProductContexts })) {
		return {
			keptCustomerProducts: [],
			changedCustomerProducts: currentRecurringCustomerProducts,
			changedProductContexts: billingContext.productContexts,
		};
	}

	const keptIds = new Set(
		keptCustomerProducts.map(({ customerProduct }) => customerProduct.id),
	);
	return {
		keptCustomerProducts,
		changedCustomerProducts: currentRecurringCustomerProducts.filter(
			(customerProduct) => !keptIds.has(customerProduct.id),
		),
		changedProductContexts,
	};
};
