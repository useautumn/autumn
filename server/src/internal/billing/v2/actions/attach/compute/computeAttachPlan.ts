import {
	type AttachBillingContext,
	type AttachParamsV1,
	type AutumnBillingPlan,
	isFreeProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyBillingCycleAnchorToSharedSubscription } from "@/internal/billing/v2/compute/computeAutumnUtils/applyBillingCycleAnchorToSharedSubscription";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { computeAttachPooledBalancePlan } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalancePlan";
import { assertRoomForExpiringGrants } from "@/internal/billing/v2/utils/expiringGrants/hasRoomForExpiringGrant";
import { splitExpiringPurchaseGrants } from "@/internal/billing/v2/utils/expiringGrants/splitExpiringPurchaseGrants";
import { cusProductToExistingBalanceCarryOvers } from "@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers";
import { cusProductToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import { computeAttachBalanceTransitionPlan } from "./computeAttachBalanceTransitionPlan.js";
import { computeAttachNewCustomerProductWithBalanceTransitions } from "./computeAttachNewCustomerProduct.js";
import { computeAttachRemovals } from "./computeAttachRemovals";
import { computeAttachTransitionUpdates } from "./computeAttachTransitionUpdates";
import { computeOneOffPurchaseRebalance } from "./computeOneOffPurchaseRebalance";
import { finalizeAttachPlan } from "./finalizeAttachPlan";
import { shouldBuildImmediateLineItems } from "./shouldBuildImmediateLineItems";

export const computeAttachPlan = ({
	ctx,
	attachBillingContext,
	params,
	hasFullCustomerOverride = false,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
	hasFullCustomerOverride?: boolean;
}): AutumnBillingPlan => {
	const {
		currentCustomerProduct,
		carryOverSourceCustomerProduct,
		licenseTransitionSourceCustomerProduct,
		scheduledCustomerProduct,
		planTiming,
		customPrices,
		customEnts,
		trialContext,
	} = attachBillingContext;

	const {
		customerProduct: newCustomerProduct,
		balanceTransitionPlan: computedBalanceTransitionPlan,
	} = computeAttachNewCustomerProductWithBalanceTransitions({
		ctx,
		attachBillingContext,
		params,
	});
	const expiringGrants = splitExpiringPurchaseGrants({
		customerProduct: newCustomerProduct,
		orgId: ctx.org.id,
		now:
			attachBillingContext.accessStartsAt ??
			attachBillingContext.currentEpochMs,
	});
	assertRoomForExpiringGrants({
		fullCustomer: attachBillingContext.fullCustomer,
		incoming: expiringGrants.customerEntitlements.length,
		now: attachBillingContext.currentEpochMs,
	});

	const oneOffPurchaseRebalance = computeOneOffPurchaseRebalance({
		ctx,
		newCustomerProduct,
	});

	const updateCustomerProduct = computeAttachTransitionUpdates({
		attachBillingContext,
		params,
	});

	const removeCustomerProducts = computeAttachRemovals({
		attachBillingContext,
		params,
	});

	const computedCustomerLicenseTransitions =
		licenseTransitionSourceCustomerProduct
			? computeCustomerLicenseTransitions({
					outgoingCustomerProducts: [licenseTransitionSourceCustomerProduct],
					incomingCustomerProducts: [newCustomerProduct],
					customerProductPairs: currentCustomerProduct
						? undefined
						: [
								{
									outgoingCustomerProduct:
										licenseTransitionSourceCustomerProduct,
									incomingCustomerProduct: newCustomerProduct,
								},
							],
					customerLicenseBillingContext:
						attachBillingContext.customerLicenseBillingContext,
					carryCustomerLicenseState: planTiming === "immediate",
					carryOverUsages: params.carry_over_usages,
				})
			: [];
	const customerLicenseTransitions =
		planTiming === "immediate" ? computedCustomerLicenseTransitions : [];

	const {
		entitlements: carriedOverEntitlements,
		customerEntitlements: carriedOverCustomerEntitlements,
	} = cusProductToExistingBalanceCarryOvers({
		attachBillingContext,
		params,
		newCustomerProduct,
	});

	const oneOffPrepaidCarryOvers =
		planTiming === "immediate" && carryOverSourceCustomerProduct
			? cusProductToOneOffPrepaidCarryOvers({
					currentCustomerProduct: carryOverSourceCustomerProduct,
					fullCustomer: attachBillingContext.fullCustomer,
				})
			: { entitlements: [], customerEntitlements: [] };

	const includeArrearLineItems = !params.carry_over_usages?.enabled;
	const shouldBuildLineItems = shouldBuildImmediateLineItems({
		planTiming,
		customerProductStatus: newCustomerProduct.status,
		accessStartsAt: attachBillingContext.accessStartsAt,
	});

	const { allLineItems: lineItems, updateCustomerEntitlements } =
		shouldBuildLineItems
			? buildAutumnLineItems({
					ctx,
					newCustomerProducts: [newCustomerProduct],
					deletedCustomerProduct: currentCustomerProduct,
					deletedCustomerProducts: removeCustomerProducts.map(
						(update) => update.customerProduct,
					),
					billingContext: attachBillingContext,
					includeArrearLineItems,
				})
			: { allLineItems: [], updateCustomerEntitlements: [] };

	const { customerProduct: preparedNewCustomerProduct, pooledBalancePlan } =
		computeAttachPooledBalancePlan({
			ctx,
			attachBillingContext,
			newCustomerProduct,
			customerLicenseTransitions,
		});

	const {
		fullCustomer,
		attachProduct,
		currency: resolvedCurrency,
	} = attachBillingContext;
	const lockCustomerCurrency =
		resolvedCurrency &&
		!fullCustomer.currency &&
		!isFreeProduct({ product: attachProduct })
			? {
					internalCustomerId: fullCustomer.internal_id,
					currency: resolvedCurrency,
				}
			: undefined;

	let plan: AutumnBillingPlan = {
		customerId: attachBillingContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [preparedNewCustomerProduct],
		lockCustomerCurrency,
		updateCustomerProduct,
		updateCustomerProducts: removeCustomerProducts,
		deleteCustomerProduct: scheduledCustomerProduct,
		customPrices,
		customEntitlements: [
			...(customEnts ?? []),
			...(carriedOverEntitlements ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
			...expiringGrants.entitlements,
		],
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: attachBillingContext.insertPlanLicenses,
		customerLicenseTransitions,
		lineItems,
		insertCustomerEntitlements: [
			...(carriedOverCustomerEntitlements ?? []),
			...oneOffPrepaidCarryOvers.customerEntitlements,
			...expiringGrants.customerEntitlements,
		],
		updateCustomerEntitlements,
		pooledBalancePlan,
		oneOffPurchaseRebalance,
	};

	plan = finalizeAttachPlan({
		ctx,
		plan,
		attachBillingContext,
		params,
	});
	plan = applyBillingCycleAnchorToSharedSubscription({
		ctx,
		plan,
		billingContext: attachBillingContext,
		stripeSubscriptionId:
			attachBillingContext.stripeSubscription?.id ??
			attachBillingContext.currentCustomerProduct?.subscription_ids?.[0],
	});
	plan.balanceTransitionPlan = computeAttachBalanceTransitionPlan({
		attachBillingContext,
		params,
		balanceTransitionPlan: computedBalanceTransitionPlan,
		autumnBillingPlan: plan,
		hasFullCustomerOverride,
	});

	return plan;
};
