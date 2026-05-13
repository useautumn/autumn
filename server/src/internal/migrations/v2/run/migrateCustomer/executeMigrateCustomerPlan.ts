import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { appendMigrationBillingLog } from "@/internal/migrations/v2/operations/utils/index.js";
import type { MigrateCustomerBillingPlan } from "./evaluateMigrateCustomerStripe.js";

export const executeMigrateCustomerPlan = async ({
	ctx,
	context,
	billingPlan,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	billingPlan: MigrateCustomerBillingPlan;
}): Promise<void> => {
	for (const stripeBillingPlan of billingPlan.stripeBillingPlans) {
		const stripeResult = await executeStripeBillingPlan({
			ctx,
			billingContext: stripeBillingPlan.billingContext,
			billingPlan: {
				autumn: billingPlan.autumn,
				stripe: stripeBillingPlan.stripeBillingPlan,
			},
		});
		appendMigrationBillingLog({
			ctx,
			key: "stripeBillingResult",
			log: (logCtx) =>
				logStripeBillingResult({ ctx: logCtx, result: stripeResult }),
		});
	}

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	const customerId =
		context.fullCustomer.id ?? context.fullCustomer.internal_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "executeMigrateCustomerPlan",
	});
};
