import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { autoTopupRebalanceToPurchase } from "../planOps/customerEntitlements/rebalancesToPlanOps.js";
import { billingPlanCustomerProducts } from "./billingPlanRows.js";
import { billingPlanToWorkerCustomerId } from "./billingPlanToWorkerCustomerId.js";
import { billingPlanNamesItsEntities } from "./billingPlanToWorkerEntityIds.js";

const writesNoLicenseSeats = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	billingPlanCustomerProducts({ autumnBillingPlan }).every(
		({ customer_license_link_id }) => !customer_license_link_id,
	);

const expiresNoLicensePools = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	(
		autumnBillingPlan.pooledBalancePlan?.expirePoolBalanceCandidates ?? []
	).every(
		({ pooledCustomerEntitlement }) =>
			!pooledCustomerEntitlement.pooled_balance?.customer_license_link_id,
	);

const claimsNoEntities = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => (autumnBillingPlan.claimEntities ?? []).length === 0;

const topUpNamesItsPurchase = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const { autoTopupRebalance } = autumnBillingPlan;
	if (!autoTopupRebalance) return true;
	return autoTopupRebalanceToPurchase({ autoTopupRebalance }) !== null;
};

export const workerCanApplyBillingPlan = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	billingPlanToWorkerCustomerId({ autumnBillingPlan }) !== null &&
	claimsNoEntities({ autumnBillingPlan }) &&
	writesNoLicenseSeats({ autumnBillingPlan }) &&
	expiresNoLicensePools({ autumnBillingPlan }) &&
	billingPlanNamesItsEntities({ autumnBillingPlan }) &&
	topUpNamesItsPurchase({ autumnBillingPlan });

export const billingPlanRoutesToWorker = ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: Pick<AutumnContext, "org">;
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const customerId = billingPlanToWorkerCustomerId({ autumnBillingPlan });
	return (
		customerId !== null &&
		isBalanceWorkerRolloutEnabled({ ctx, customerId }) &&
		workerCanApplyBillingPlan({ autumnBillingPlan })
	);
};
