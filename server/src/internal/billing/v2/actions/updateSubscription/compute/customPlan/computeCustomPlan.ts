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
import { buildCustomLicenseChanges } from "@/internal/billing/v2/compute/computeAutumnUtils/buildCustomLicenseChanges";
import { computePatchCustomerProductPlan } from "@/internal/billing/v2/compute/computePatchPlan";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
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

	const customLicenses = buildCustomLicenseChanges({
		parentCustomerProduct: newFullCustomerProduct,
		previousParentCustomerProduct: customerProduct,
		licensePatch: params.customize,
	});

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomerProducts: [newFullCustomerProduct],
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
			newCustomerProduct: newFullCustomerProduct,
		}),
		customPrices,
		customEntitlements: [
			...(customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: trialContext?.customFreeTrial,
		customLicenses,
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
	} satisfies AutumnBillingPlan;
};
