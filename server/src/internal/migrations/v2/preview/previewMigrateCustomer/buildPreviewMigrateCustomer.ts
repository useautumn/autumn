import { getApiBalances } from "@api/customers/cusFeatures";
import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingChanges } from "@/internal/billing/v2/actions/buildBillingChanges";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import {
	type PreviewMigrateCustomer,
	PreviewMigrateCustomerSchema,
} from "./types/index.js";

export const buildPreviewMigrateCustomer = async ({
	ctx,
	originalFullCustomer,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewMigrateCustomer> => {
	const migratedFullCustomer = applyAutumnBillingPlanToFullCustomer({
		fullCustomer: originalFullCustomer,
		autumnBillingPlan,
	});

	const [originalFeatures, migratedFeatures] = await Promise.all([
		getApiBalances({ ctx, fullCus: originalFullCustomer }),
		getApiBalances({ ctx, fullCus: migratedFullCustomer }),
	]);

	const { planChanges, balanceChanges, flagChanges } = buildBillingChanges({
		autumnBillingPlan,
		originalFullCustomer,
		beforeBalances: originalFeatures.balances,
		afterBalances: migratedFeatures.balances,
		beforeFlags: originalFeatures.flags,
		afterFlags: migratedFeatures.flags,
	});

	return PreviewMigrateCustomerSchema.parse({
		object: "migration_customer_preview",
		customer_id: originalFullCustomer.id ?? originalFullCustomer.internal_id,
		plan_changes: planChanges,
		balance_changes: balanceChanges,
		flag_changes: flagChanges,
	});
};
