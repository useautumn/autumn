import {
	type AutumnBillingPlan,
	CusProductStatus,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { initPatchCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";

const getPatchTrialUpdates = ({
	updateSubscriptionContext,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}) => {
	const { trialContext } = updateSubscriptionContext;

	if (!trialContext) return {};

	if (trialContext.customFreeTrial) {
		return {
			free_trial_id: trialContext.customFreeTrial.id,
			trial_ends_at: trialContext.trialEndsAt ?? null,
		};
	}

	if (trialContext.trialEndsAt === null) {
		return {
			free_trial_id: null,
			trial_ends_at: null,
		};
	}

	return {};
};

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

	const finalCustomerProduct = initPatchCustomerProduct({
		ctx,
		billingContext: updateSubscriptionContext,
		patchContext,
	});

	const { allLineItems } = buildAutumnLineItems({
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
	} satisfies Partial<AutumnBillingPlan>;

	if (patchContext.mode === "new") {
		return {
			...basePlan,
			insertCustomerProducts: [finalCustomerProduct],
			updateCustomerProduct: {
				customerProduct: patchContext.originalCustomerProduct,
				updates: {
					status: CusProductStatus.Expired,
					ended_at: Date.now(),
					canceled: true,
					canceled_at: Date.now(),
				},
			},
		} satisfies AutumnBillingPlan;
	}

	return {
		...basePlan,
		insertCustomerProducts: [],
		updateCustomerProducts: [
			{
				customerProduct: patchContext.originalCustomerProduct,
				updates: {
					options: finalCustomerProduct.options,
					updated_at: Date.now(),
					...getPatchTrialUpdates({ updateSubscriptionContext }),
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
