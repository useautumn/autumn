import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyDerivedCustomerProductIsCustom } from "@/internal/billing/v2/execute/applyDerivedCustomerProductIsCustom";
import { executeInsertPlanLicenses } from "@/internal/billing/v2/execute/executeAutumnActions/executeInsertPlanLicenses";
import { insertCustomCatalogRows } from "@/internal/billing/v2/execute/executeAutumnActions/insertCustomCatalogRows";
import { insertPooledBalanceEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/insertPooledBalanceEntitlements";

export const resolvePlanCatalog = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<void> => {
	await applyDerivedCustomerProductIsCustom({ ctx, autumnBillingPlan });
	await insertCustomCatalogRows({ ctx, autumnBillingPlan });
	await insertPooledBalanceEntitlements({
		ctx,
		pooledBalancePlan: autumnBillingPlan.pooledBalancePlan,
	});
	await executeInsertPlanLicenses({
		ctx,
		insertPlanLicenses: autumnBillingPlan.insertPlanLicenses,
	});
};
