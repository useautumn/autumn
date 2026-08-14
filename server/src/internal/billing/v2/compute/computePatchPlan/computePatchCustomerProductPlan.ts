import {
	type AutumnBillingPlan,
	CusProductStatus,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeRetainedCustomerEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeRetainedCustomerEntitlementUpdates";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { initPatchCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";

export const computePatchCustomerProductPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { fullCustomer, patchContext, trialContext } =
		updateSubscriptionContext;

	if (!patchContext) {
		throw new Error("Patch context is required to compute patch customer plan");
	}

	const {
		finalCustomerProduct,
		customerProductUpdates,
		oneOffPrepaidCarryOverCustomerEntitlements,
	} = initPatchCustomerProduct({
		ctx,
		billingContext: updateSubscriptionContext,
		patchContext,
	});

	const isUpdatingScheduledProduct =
		patchContext.originalCustomerProduct.status === CusProductStatus.Scheduled;

	// Same-row license transitions: outgoing = the pristine original,
	// incoming = the patched working copy (converged pools).
	const customerLicenseTransitions = computeCustomerLicenseTransitions({
		outgoingCustomerProducts: [patchContext.originalCustomerProduct],
		incomingCustomerProducts: [finalCustomerProduct],
		customerLicenseBillingContext:
			updateSubscriptionContext.customerLicenseBillingContext,
	});

	// A scheduled cusProduct hasn't started billing yet, so there's nothing to
	// prorate — its future phase item swap is applied wholesale via
	// schedulePhaseCustomerProductReplacements, not an immediate invoice line.
	const { allLineItems } = isUpdatingScheduledProduct
		? { allLineItems: [] }
		: buildAutumnLineItems({
				ctx,
				newCustomerProducts: [finalCustomerProduct],
				deletedCustomerProduct: patchContext.originalCustomerProduct,
				billingContext: updateSubscriptionContext,
				includeArrearLineItems:
					updateSubscriptionContext.chargeExistingOverages === true,
			});
	const basePlan = {
		customerId: fullCustomer?.id ?? "",
		customPrices: patchContext.customPrices,
		customEntitlements: patchContext.customEntitlements,
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: updateSubscriptionContext.insertPlanLicenses,
		customerLicenseTransitions,
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOverCustomerEntitlements,
		updateCustomerEntitlements: computeRetainedCustomerEntitlementUpdates({
			updateSubscriptionContext,
			finalCustomerProduct,
		}),
	} satisfies Partial<AutumnBillingPlan>;

	if (patchContext.mode === "new") {
		return {
			...basePlan,
			insertCustomerProducts: [finalCustomerProduct],
			updateCustomerProduct: isUpdatingScheduledProduct
				? undefined
				: {
						customerProduct: patchContext.originalCustomerProduct,
						updates: {
							status: CusProductStatus.Expired,
							ended_at: Date.now(),
							canceled: true,
							canceled_at: Date.now(),
						},
					},
			deleteCustomerProduct: isUpdatingScheduledProduct
				? patchContext.originalCustomerProduct
				: undefined,
		} satisfies AutumnBillingPlan;
	}

	return {
		...basePlan,
		insertCustomerProducts: [],
		updateCustomerProducts: [
			{
				customerProduct: patchContext.originalCustomerProduct,
				updates: {
					...customerProductUpdates,
					updated_at: Date.now(),
				},
			},
		],
		patchCustomerProducts: [
			{
				customerProduct: patchContext.originalCustomerProduct,
				insertCustomerPrices: patchContext.insertCustomerPrices,
				insertCustomerEntitlements: patchContext.insertCustomerEntitlements,
				deleteCustomerPrices: patchContext.deleteCustomerPrices,
				deleteCustomerEntitlements: patchContext.deleteCustomerEntitlements,
			},
		],
	} satisfies AutumnBillingPlan;
};
