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
import { cusProductToExistingBalanceCarryOvers } from "@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers";
import { cusProductToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import { computeAttachBalanceTransitionPlan } from "./computeAttachBalanceTransitionPlan.js";
import { computeAttachNewCustomerProductWithBalanceTransitions } from "./computeAttachNewCustomerProduct.js";
import { computeAttachRemovals } from "./computeAttachRemovals";
import { computeAttachTransitionUpdates } from "./computeAttachTransitionUpdates";
import { computeOneOffPurchaseRebalance } from "./computeOneOffPurchaseRebalance";
import { finalizeAttachPlan } from "./finalizeAttachPlan";
import { shouldBuildImmediateLineItems } from "./shouldBuildImmediateLineItems";

/** Computes new attachments and immediate or scheduled product transitions. */
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

	// Customer licenses follow the incoming definitions on immediate swaps;
	// scheduled swaps transition at activation instead.
	const computedCustomerLicenseTransitions = currentCustomerProduct
		? computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [currentCustomerProduct],
				incomingCustomerProducts: [newCustomerProduct],
				customerLicenseBillingContext:
					attachBillingContext.customerLicenseBillingContext,
				carryCustomerLicenseState: planTiming === "immediate",
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
	});

	// Auto-preserve one-off prepaid balances on immediate transitions so the
	// credits the customer already paid for don't vanish when the cusProduct
	// expires. Skipped on scheduled transitions — the outgoing product remains
	// active until end-of-cycle and the preservation runs at activation time.
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
					// Plans dropped via `remove_plan_ids` are expired mid-cycle, so they
					// owe the same unused-time credit as a same-group replacement.
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
		});

	// Lock the customer's currency on the first paid attach (only when they have
	// none yet). Free attaches don't commit a currency. Applied conditionally at execute.
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
		],
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: attachBillingContext.insertPlanLicenses,
		customerLicenseTransitions,
		lineItems,
		insertCustomerEntitlements: [
			...(carriedOverCustomerEntitlements ?? []),
			...oneOffPrepaidCarryOvers.customerEntitlements,
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
