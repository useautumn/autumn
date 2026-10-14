import {
	type AttachBillingContext,
	type AttachParamsV1,
	CusProductStatus,
	type CustomerProductUpdate,
	cp,
	ErrCode,
	findActiveCustomerProductById,
	isFutureStartDate,
	RecaseError,
} from "@autumn/shared";

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
		planTiming,
	} = attachBillingContext;

	const removePlanIds = [
		...new Set(
			(params.remove_plan_ids ?? []).filter(
				(productId) => productId !== currentCustomerProduct?.product.id,
			),
		),
	];
	if (removePlanIds.length === 0) return [];

	const newPlanStartsLater =
		planTiming !== "immediate" ||
		(isFutureStartDate(params.starts_at, currentEpochMs) &&
			params.enable_plan_immediately !== true);
	if (newPlanStartsLater) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"remove_plan_ids can only be used with an immediate attach. Remove the plans separately or attach immediately.",
			statusCode: 400,
		});
	}

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
