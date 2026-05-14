import { getApiBalances } from "@api/customers/cusFeatures";
import type { AutumnBillingPlan, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import { buildBalanceChanges } from "./buildBalanceChanges.js";
import { buildFlagChanges } from "./buildFlagChanges.js";
import { buildPlanChanges } from "./buildPlanChanges.js";
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

	return PreviewMigrateCustomerSchema.parse({
		object: "migration_customer_preview",
		customer_id: originalFullCustomer.id ?? originalFullCustomer.internal_id,
		plan_changes: buildPlanChanges({ autumnBillingPlan }),
		balance_changes: buildBalanceChanges({
			beforeBalances: originalFeatures.balances,
			afterBalances: migratedFeatures.balances,
		}),
		flag_changes: buildFlagChanges({
			beforeFlags: originalFeatures.flags,
			afterFlags: migratedFeatures.flags,
		}),
	});
};
