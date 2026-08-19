import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
	BalanceTransitionPlan,
	BalanceTransitionUnsupportedReason,
} from "@autumn/shared";

const rejectBalanceTransitionPlan = ({
	balanceTransitionPlan,
	unsupportedReason,
}: {
	balanceTransitionPlan: BalanceTransitionPlan;
	unsupportedReason: BalanceTransitionUnsupportedReason;
}): BalanceTransitionPlan => ({
	...balanceTransitionPlan,
	unsupportedReason,
});

export const computeAttachBalanceTransitionPlan = ({
	attachBillingContext,
	params,
	balanceTransitionPlan,
	autumnBillingPlan,
	hasFullCustomerOverride,
}: {
	attachBillingContext: AttachBillingContext;
	params: AttachParamsV1;
	balanceTransitionPlan?: BalanceTransitionPlan;
	autumnBillingPlan: Pick<
		AutumnBillingPlan,
		| "insertCustomerEntitlements"
		| "oneOffPurchaseRebalance"
		| "pooledBalancePlan"
	>;
	hasFullCustomerOverride: boolean;
}): BalanceTransitionPlan | undefined => {
	if (!balanceTransitionPlan) return undefined;
	if (hasFullCustomerOverride) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "full_customer_override",
		});
	}

	const sourceCustomerProduct =
		attachBillingContext.carryOverSourceCustomerProduct ??
		attachBillingContext.currentCustomerProduct;
	if (
		sourceCustomerProduct?.id !==
		attachBillingContext.currentCustomerProduct?.id
	) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "cross_product_carry",
		});
	}
	if (params.carry_over_balances?.enabled) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "carry_over_balances",
		});
	}
	if ((autumnBillingPlan.insertCustomerEntitlements?.length ?? 0) > 0) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "inserted_customer_entitlements",
		});
	}
	if (autumnBillingPlan.pooledBalancePlan) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "pooled_balance_plan",
		});
	}
	if (autumnBillingPlan.oneOffPurchaseRebalance) {
		return rejectBalanceTransitionPlan({
			balanceTransitionPlan,
			unsupportedReason: "one_off_purchase_rebalance",
		});
	}

	return balanceTransitionPlan;
};
