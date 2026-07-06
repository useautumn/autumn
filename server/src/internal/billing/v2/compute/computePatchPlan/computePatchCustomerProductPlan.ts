import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	getCycleEnd,
	isBooleanEntitlement,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import { entitlementToResetCycleAnchor } from "@/internal/billing/v2/utils/initFullCustomerProduct/cycleAnchorUtils";
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
	} =
		initPatchCustomerProduct({
			ctx,
			billingContext: updateSubscriptionContext,
			patchContext,
		});

	const isUpdatingScheduledProduct =
		patchContext.originalCustomerProduct.status === CusProductStatus.Scheduled;

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
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOverCustomerEntitlements,
		updateCustomerEntitlements: computeAnchorResetEntitlementUpdates({
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
			schedulePhaseCustomerProductReplacements:
				computeSchedulePhaseReplacements({
					oldCustomerProduct: patchContext.originalCustomerProduct,
					newCustomerProduct: finalCustomerProduct,
				}),
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

const computeAnchorResetEntitlementUpdates = ({
	updateSubscriptionContext,
	finalCustomerProduct,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	finalCustomerProduct: UpdateSubscriptionBillingContext["customerProduct"];
}): AutumnBillingPlan["updateCustomerEntitlements"] => {
	if (updateSubscriptionContext.requestedBillingCycleAnchor !== "now") return [];

	return finalCustomerProduct.customer_entitlements
		.filter((customerEntitlement) => {
			const { entitlement } = customerEntitlement;
			return (
				!isBooleanEntitlement({ entitlement }) &&
				entitlement.allowance !== null
			);
		})
		.map((customerEntitlement) => ({
			customerEntitlement,
			updates: {
				reset_cycle_anchor: entitlementToResetCycleAnchor({
					entitlement: customerEntitlement.entitlement,
					resetCycleAnchor: updateSubscriptionContext.resetCycleAnchorMs,
					now: updateSubscriptionContext.currentEpochMs,
				}),
				next_reset_at: getCycleEnd({
					anchor: updateSubscriptionContext.resetCycleAnchorMs,
					interval:
						customerEntitlement.entitlement.interval ?? EntInterval.Month,
					intervalCount: customerEntitlement.entitlement.interval_count,
					now: updateSubscriptionContext.currentEpochMs,
				}),
			},
		}));
};
