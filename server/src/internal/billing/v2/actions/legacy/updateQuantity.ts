import type {
	UpdateSubscriptionBillingContextOverride,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import {
	type AttachBodyV0,
	BillingVersion,
	findActiveCustomerProductById,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { attachParamsToStripeBillingContext } from "@/internal/billing/v2/actions/legacy/utils/attachParamsToStripeBillingContext";
import { setupLegacyTransitionContext } from "@/internal/billing/v2/actions/legacy/utils/setupLegacyFeatureQuantitiesContext";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const updateQuantity = async ({
	ctx,
	body,
	attachParams,
}: {
	ctx: AutumnContext;
	body: AttachBodyV0;
	attachParams: AttachParams;
}) => {
	const fullProduct = {
		...attachParams.products[0],
		prices: attachParams.prices,
		entitlements: attachParams.entitlements,
	};

	const stripeBillingContext = await attachParamsToStripeBillingContext({
		ctx,
		attachParams,
		fullProduct,
	});

	// Current customer product
	const currentCustomerProduct = findActiveCustomerProductById({
		fullCus: attachParams.customer,
		productId: fullProduct.id,
		internalEntityId: attachParams.customer.entity?.internal_id,
	});

	if (!currentCustomerProduct) {
		throw new InternalError({
			message: `[updateQuantity] Current customer product not found: ${fullProduct.id}`,
		});
	}

	const billingContextOverride: UpdateSubscriptionBillingContextOverride = {
		fullCustomer: attachParams.customer,
		productContext: {
			fullProduct,
			customerProduct: currentCustomerProduct,
		},

		stripeBillingContext,
		featureQuantities: attachParams.optionsList,
		transitionConfigs: setupLegacyTransitionContext({ attachParams }),
		billingVersion: BillingVersion.V1,
	};

	const fullCustomer = attachParams.customer;

	const params: UpdateSubscriptionV0Params = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		entity_id: fullCustomer.entity?.id,
		product_id: fullProduct.id,

		invoice: body.invoice,
		enable_product_immediately: body.enable_product_immediately,
		finalize_invoice: body.finalize_invoice,

		options: attachParams.optionsList,
	};

	const res = await billingActions.updateSubscription({
		ctx,
		params,
		contextOverride: billingContextOverride,
	});

	const billingResponse = billingResultToResponse({
		billingContext: res.billingContext,
		billingResult: res.billingResult ?? { stripe: {} },
	});

	return {
		...res,
		billingResponse,
	};
};
