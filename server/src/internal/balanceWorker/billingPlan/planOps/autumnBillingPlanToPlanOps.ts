import type { BillingPlanOp } from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { insertCustomerToPlanOps } from "./customer/insertCustomerToPlanOps.js";
import { lockCustomerCurrencyToPlanOps } from "./customer/lockCustomerCurrencyToPlanOps.js";
import { updateCustomerToPlanOps } from "./customer/updateCustomerToPlanOps.js";
import { insertCustomerEntitlementsToPlanOps } from "./customerEntitlements/insertCustomerEntitlementsToPlanOps.js";
import { rebalancesToPlanOps } from "./customerEntitlements/rebalancesToPlanOps.js";
import { updateCustomerEntitlementsToPlanOps } from "./customerEntitlements/updateCustomerEntitlementsToPlanOps.js";
import { deleteCustomerProductsToPlanOps } from "./customerProducts/deleteCustomerProductsToPlanOps.js";
import { insertCustomerProductsToPlanOps } from "./customerProducts/insertCustomerProductsToPlanOps.js";
import { patchCustomerProductsToPlanOps } from "./customerProducts/patchCustomerProductsToPlanOps.js";
import { updateCustomerProductsToPlanOps } from "./customerProducts/updateCustomerProductsToPlanOps.js";
import { insertEntitiesToPlanOps } from "./entities/insertEntitiesToPlanOps.js";
import { pooledBalancePlanToPlanOps } from "./pooledBalances/pooledBalancePlanToPlanOps.js";

/** Every row the worker holds that the plan writes, as ops in the order the Postgres lane writes them; purchases last, sized by the worker. */
export const autumnBillingPlanToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => [
	...insertCustomerToPlanOps({ autumnBillingPlan }),
	...updateCustomerToPlanOps({ autumnBillingPlan }),
	...insertCustomerEntitlementsToPlanOps({ autumnBillingPlan }),
	...patchCustomerProductsToPlanOps({ autumnBillingPlan }),
	...insertEntitiesToPlanOps({ autumnBillingPlan }),
	...insertCustomerProductsToPlanOps({ autumnBillingPlan }),
	...lockCustomerCurrencyToPlanOps({ autumnBillingPlan }),
	...updateCustomerProductsToPlanOps({ autumnBillingPlan }),
	...deleteCustomerProductsToPlanOps({ autumnBillingPlan }),
	...updateCustomerEntitlementsToPlanOps({ autumnBillingPlan }),
	...pooledBalancePlanToPlanOps({ autumnBillingPlan }),
	...rebalancesToPlanOps({ autumnBillingPlan }),
];
