import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { autoTopupRebalanceToPurchase } from "../planOps/customerEntitlements/rebalancesToPlanOps.js";
import { billingPlanCustomerProducts } from "./billingPlanRows.js";
import { billingPlanToWorkerCustomerId } from "./billingPlanToWorkerCustomerId.js";
import { billingPlanNamesItsEntities } from "./billingPlanToWorkerEntityIds.js";

/** License seats are left out of the worker's state, so a plan writing one keeps to Postgres. */
const writesNoLicenseSeats = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	billingPlanCustomerProducts({ autumnBillingPlan }).every(
		({ customer_license_link_id }) => !customer_license_link_id,
	);

/** A claimed entity had no subject key before the plan, so the worker cannot guard it yet. */
const claimsNoEntities = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => (autumnBillingPlan.claimEntities ?? []).length === 0;

/** A top-up without its purchase fields carries only fixed deltas: those land in Postgres, as before the worker sized them. */
const topUpNamesItsPurchase = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean => {
	const { autoTopupRebalance } = autumnBillingPlan;
	if (!autoTopupRebalance) return true;
	return autoTopupRebalanceToPurchase({ autoTopupRebalance }) !== null;
};

/** Whether the worker can key every row it holds that the plan writes; the rest land in Postgres after it. */
export const workerCanApplyBillingPlan = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	billingPlanToWorkerCustomerId({ autumnBillingPlan }) !== null &&
	billingPlanNamesItsEntities({ autumnBillingPlan }) &&
	claimsNoEntities({ autumnBillingPlan }) &&
	writesNoLicenseSeats({ autumnBillingPlan }) &&
	topUpNamesItsPurchase({ autumnBillingPlan });

/** Whether the customer's rows land through the worker instead of one Postgres transaction. */
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
