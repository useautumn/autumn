import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyDerivedCustomerProductIsCustom } from "@/internal/billing/v2/execute/applyDerivedCustomerProductIsCustom";
import { executeInsertPlanLicenses } from "@/internal/billing/v2/execute/executeAutumnActions/executeInsertPlanLicenses";
import { insertCustomCatalogRows } from "@/internal/billing/v2/execute/executeAutumnActions/insertCustomCatalogRows";

/** The catalog the plan's rows reference: `is_custom` derived against it, then custom rows and plan licenses inserted. */
export const resolvePlanCatalog = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<void> => {
	// From the customer product's own items, never request input; may add an update entry to persist it.
	await applyDerivedCustomerProductIsCustom({ ctx, autumnBillingPlan });
	await insertCustomCatalogRows({ ctx, autumnBillingPlan });
	await executeInsertPlanLicenses({
		ctx,
		insertPlanLicenses: autumnBillingPlan.insertPlanLicenses,
	});
};
