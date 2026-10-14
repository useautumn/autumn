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
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions";
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

	const newFullCustomerProduct = computeCustomPlanNewCustomerProduct({
		ctx,
		params,
		updateSubscriptionContext,
		fullProduct: customFullProduct,
		currentCustomerProduct: customerProduct,
	});

	const oneOffPrepaidCarryOvers = applyOneOffPrepaidCarryOvers({
		oldCustomerProduct: customerProduct,
		newCustomerProduct: newFullCustomerProduct,
		fullCustomer,
	});
	const isUpdatingScheduledProduct =
		customerProduct.status === CusProductStatus.Scheduled;

	const customerLicenseTransitions = isUpdatingScheduledProduct
		? []
		: computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [customerProduct],
				incomingCustomerProducts: [newFullCustomerProduct],
				customerLicenseBillingContext:
					updateSubscriptionContext.customerLicenseBillingContext,
				carryOverUsages: updateSubscriptionContext.carryOverUsages,
			});

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

	const deleteCustomerProduct = computeDeleteCustomerProduct({
		fullCustomer,
		customerProduct,
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
		customPrices,
		customEntitlements: [
			...(customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: trialContext?.customFreeTrial,
		insertPlanLicenses: updateSubscriptionContext.insertPlanLicenses,
		customerLicenseTransitions,
		lineItems: allLineItems,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
	} satisfies AutumnBillingPlan;
};
