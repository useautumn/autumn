import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeMultiSubscriptionBillingPlan } from "@/internal/billing/v2/execute/executeMultiSubscriptionBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { appendMigrationBillingLog } from "@/internal/migrations/v2/operations/utils/index.js";
import type { MigrateCustomerBillingPlan } from "./evaluateMigrateCustomerStripe.js";

export const executeMigrateCustomerPlan = async ({
	ctx,
	context,
	billingPlan,
	billingContexts,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	billingPlan: MigrateCustomerBillingPlan;
	billingContexts: UpdateSubscriptionBillingContext[];
}): Promise<void> => {
	await executeMultiSubscriptionBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		stripeBillingPlans: billingPlan.stripeBillingPlans,
		primaryBillingContext: billingContexts[0],
		originalFullCustomer: context.fullCustomer,
		awaitBillingUpdatedWebhook: true,
		onStripeResult: (result) => {
			appendMigrationBillingLog({
				ctx,
				key: "stripeBillingResult",
				log: (logCtx) => logStripeBillingResult({ ctx: logCtx, result }),
			});
		},
	});

	const customerId =
		context.fullCustomer.id ?? context.fullCustomer.internal_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "executeMigrateCustomerPlan",
	});
};
