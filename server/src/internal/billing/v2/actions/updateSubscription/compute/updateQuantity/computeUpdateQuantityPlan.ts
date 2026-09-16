import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getCurrentBillingCycleAnchorMs } from "@/internal/billing/v2/utils/billingContext/getCurrentBillingCycleAnchorMs.js";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import { computeLicenseQuantityDetails } from "./computeLicenseQuantityDetails.js";
import {
	computePrepaidQuantityDetails,
	type PrepaidQuantityDetails,
} from "./computePrepaidQuantityDetails.js";
import { computeUpdateQuantityAnchorResetPlan } from "./computeUpdateQuantityAnchorResetPlan.js";

import { computeUpdateQuantityScheduledAnchorPlan } from "./computeUpdateQuantityScheduledAnchorPlan.js";

const untouchedPrepaidQuantities: PrepaidQuantityDetails = {
	updatedOptions: [],
	updateCustomerEntitlements: [],
	lineItems: [],
	updatePoolContributions: [],
};

/**
 * Converges the customer product's quantity dials in place — recurring prepaid
 * options on the parent and license pool paid counts — in one plan.
 */
export const computeUpdateQuantityPlan = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): AutumnBillingPlan => {
	const { customerProduct } = billingContext;
	const currentBillingCycleAnchorMs = getCurrentBillingCycleAnchorMs({
		billingContext,
	});
	const quantityContext: UpdateSubscriptionBillingContext =
		billingContext.requestedBillingCycleAnchor === undefined
			? billingContext
			: {
					...billingContext,
					billingCycleAnchorMs: currentBillingCycleAnchorMs,
					resetCycleAnchorMs: currentBillingCycleAnchorMs,
				};

	// featureQuantities always carries current options as fallback, so a
	// seat-only request must skip the prepaid facet to leave options untouched.
	const prepaid = isLicenseOnlyRequest({ params })
		? untouchedPrepaidQuantities
		: computePrepaidQuantityDetails({
				ctx,
				billingContext: quantityContext,
				params,
			});
	const license = computeLicenseQuantityDetails({
		ctx,
		billingContext: quantityContext,
	});

	const plan: AutumnBillingPlan = {
		customerId: billingContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: isLicenseOnlyRequest({ params })
			? undefined
			: { customerProduct, updates: { options: prepaid.updatedOptions } },
		updateCustomerEntitlements: prepaid.updateCustomerEntitlements,
		customerLicenseUpdates: license.customerLicenseUpdates,
		lineItems: [...prepaid.lineItems, ...license.lineItems],
		...(prepaid.updatePoolContributions.length > 0
			? {
					pooledBalancePlan: {
						...emptyPooledBalancePlan(),
						updatePoolContributions: prepaid.updatePoolContributions,
					},
				}
			: {}),
	};
	return billingContext.requestedBillingCycleAnchor === "now"
		? computeUpdateQuantityAnchorResetPlan({ ctx, billingContext, plan })
		: typeof billingContext.requestedBillingCycleAnchor === "number"
			? computeUpdateQuantityScheduledAnchorPlan({ billingContext, plan })
			: plan;
};

const isLicenseOnlyRequest = ({
	params,
}: {
	params: UpdateSubscriptionV1Params;
}) =>
	(params.license_quantities?.length ?? 0) > 0 &&
	(params.feature_quantities?.length ?? 0) === 0;
