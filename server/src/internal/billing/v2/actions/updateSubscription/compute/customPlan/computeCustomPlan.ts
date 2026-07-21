import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { computeDeleteCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/computeDeleteCustomerProduct";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computePatchCustomerProductPlan } from "@/internal/billing/v2/compute/computePatchPlan";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { applyOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/applyOneOffPrepaidCarryOvers";

export const computeCustomPlan = async ({
	ctx,
	params,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}) => {
	if (updateSubscriptionContext.patchContext) {
		return computePatchCustomerProductPlan({
			ctx,
			updateSubscriptionContext,
		});
	}

	const {
		customerProduct,
		customPrices,
		customEnts,
		trialContext,
		fullCustomer,
	} = updateSubscriptionContext;

	const customFullProduct = updateSubscriptionContext.fullProducts[0];

	// Compute the new customer product. One-off prepaid cusEnts are auto-skipped
	// from existingUsage carry inside cusProductToExistingUsages (per-cusEnt
	// defense), so callers don't need to plumb anything for the one-off case.
	const newFullCustomerProduct = computeCustomPlanNewCustomerProduct({
		ctx,
		params,
		updateSubscriptionContext,
		fullProduct: customFullProduct,
		currentCustomerProduct: customerProduct,
	});

	// Merges any preserved one-off balance into the matching slot on the new
	// cusProduct (mutating its cusEnt) when one exists; otherwise emits a
	// lifetime carryover row. Keeps customers from accumulating orphan
	// lifetime cusEnts on item-list updates that retain the same one-off item.
	const oneOffPrepaidCarryOvers = applyOneOffPrepaidCarryOvers({
		oldCustomerProduct: customerProduct,
		newCustomerProduct: newFullCustomerProduct,
		fullCustomer,
	});
	const isUpdatingScheduledProduct =
		customerProduct.status === CusProductStatus.Scheduled;

	// Expire+insert: the replanted pool adopts the outgoing link + counters,
	// so seats never strand. Scheduled swaps transition at activation.
	const customerLicenseTransitions = isUpdatingScheduledProduct
		? []
		: computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [customerProduct],
				incomingCustomerProducts: [newFullCustomerProduct],
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
				newCustomerProducts: [newFullCustomerProduct],
				deletedCustomerProduct: customerProduct,
				billingContext: updateSubscriptionContext,

				includeArrearLineItems:
					updateSubscriptionContext.chargeExistingOverages === true,
			});

	// If customer product is canceling, compute the scheduled product to delete
	const deleteCustomerProduct = computeDeleteCustomerProduct({
		fullCustomer,
		customerProduct,
	});
	const { customerProduct: preparedCustomerProduct, pooledBalanceOps } =
		computeAttachPooledBalanceOps({
			customerProduct: newFullCustomerProduct,
			attachBillingContext: {
				currentCustomerProduct: customerProduct,
				currentEpochMs: updateSubscriptionContext.currentEpochMs,
				fullCustomer,
				planTiming: isUpdatingScheduledProduct ? "end_of_cycle" : "immediate",
				requestedBillingCycleAnchor:
					updateSubscriptionContext.requestedBillingCycleAnchor,
				skipBillingChanges: updateSubscriptionContext.skipBillingChanges,
			},
		});

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomerProducts: [preparedCustomerProduct],
		updateCustomerProduct: isUpdatingScheduledProduct
			? undefined
			: {
					customerProduct,
					updates: {
						status: CusProductStatus.Expired,
					},
				},
		deleteCustomerProduct: isUpdatingScheduledProduct
			? customerProduct
			: deleteCustomerProduct,
		schedulePhaseCustomerProductReplacements: computeSchedulePhaseReplacements({
			oldCustomerProduct: customerProduct,
			newCustomerProduct: preparedCustomerProduct,
		}),
		customPrices,
		customEntitlements: [
			...(customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: updateSubscriptionContext.insertPlanLicenses,
		customerLicenseTransitions,
		pooledBalanceOps,
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
	} satisfies AutumnBillingPlan;
};
