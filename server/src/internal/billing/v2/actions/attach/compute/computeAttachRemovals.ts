import {
	type AttachBillingContext,
	type AttachParamsV1,
	CusProductStatus,
	type CustomerProductUpdate,
	cp,
	ErrCode,
	findActiveCustomerProductById,
	RecaseError,
} from "@autumn/shared";

/**
 * Expires the extra plans named in `remove_plan_ids` alongside the attach.
 * Removal flows to Stripe declaratively: the expired plans drop out of the
 * final customer state, so this only reconciles the attach's own subscription.
 */
export const computeAttachRemovals = ({
	attachBillingContext,
	params,
}: {
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
}): CustomerProductUpdate[] => {
	const {
		fullCustomer,
		stripeSubscription,
		currentCustomerProduct,
		currentEpochMs,
	} = attachBillingContext;

	// The current product is already expired via the transition update.
	const removePlanIds = (params.remove_plan_ids ?? []).filter(
		(productId) => productId !== currentCustomerProduct?.product.id,
	);
	if (removePlanIds.length === 0) return [];

	// Carry-over reads a single source. With no same-group product to carry from,
	// removing multiple plans is ambiguous — there is no merge rule.
	const carryOverRequested = Boolean(
		params.carry_over_usages?.enabled || params.carry_over_balances?.enabled,
	);
	if (
		!currentCustomerProduct &&
		carryOverRequested &&
		removePlanIds.length > 1
	) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot carry over usage when removing multiple plans. Remove them one at a time.",
			statusCode: 400,
		});
	}

	return removePlanIds.map((productId) =>
		computeRemovalUpdate({
			productId,
			params,
			fullCustomer,
			stripeSubscription,
			currentEpochMs,
		}),
	);
};

const computeRemovalUpdate = ({
	productId,
	params,
	fullCustomer,
	stripeSubscription,
	currentEpochMs,
}: {
	productId: string;
	params: AttachParamsV1;
	fullCustomer: AttachBillingContext["fullCustomer"];
	stripeSubscription: AttachBillingContext["stripeSubscription"];
	currentEpochMs: number;
}): CustomerProductUpdate => {
	if (productId === params.plan_id) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `Cannot remove plan '${productId}' in the same attach that adds it`,
			statusCode: 400,
		});
	}

	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	if (!customerProduct) {
		throw new RecaseError({
			code: ErrCode.ProductNotFound,
			message: `No active plan '${productId}' found on the customer to remove`,
			statusCode: 404,
		});
	}

	// Removal only cancels the attach's own subscription, so a plan billed on a
	// separate subscription would be expired in Autumn but left live in Stripe.
	const removableInThisAttach = cp(customerProduct)
		.free()
		.or.onStripeSubscription({
			stripeSubscriptionId: stripeSubscription?.id ?? "",
		}).valid;
	if (!removableInThisAttach) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `Plan '${productId}' is billed on a separate subscription and cannot be removed in this attach`,
			statusCode: 400,
		});
	}

	return {
		customerProduct,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: currentEpochMs,
			canceled: true,
			canceled_at: currentEpochMs,
		},
	};
};
