import type {
	UpdateSubscriptionBillingContextOverride,
	UpdateSubscriptionV1Params,
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
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const renew = async ({
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
		transitionConfig: setupLegacyTransitionContext({ attachParams }),
		billingVersion: BillingVersion.V1,
	};

	const fullCustomer = attachParams.customer;

	const params: UpdateSubscriptionV1Params = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		entity_id: fullCustomer.entity?.id,
		plan_id: fullProduct.id,

		invoice_mode: body.invoice
			? {
					enabled: true,
					enable_product_immediately: body.enable_product_immediately ?? false,
					finalize_invoice: body.finalize_invoice ?? true,
				}
			: undefined,

		// feature_quantities: attachParams.optionsList,
		cancel_action: "uncancel",
	};

	return await billingActions.updateSubscription({
		ctx,
		params,
		contextOverride: billingContextOverride,
	});
};
