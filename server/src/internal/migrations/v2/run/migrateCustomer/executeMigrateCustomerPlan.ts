import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.js";
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

	const primaryBillingContext = billingContexts[0];
	if (primaryBillingContext) {
		await billingPlanToSendProductsUpdated({
			ctx,
			autumnBillingPlan: billingPlan.autumn,
			billingContext: primaryBillingContext,
		});
	}

	await sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
		originalFullCustomer: context.fullCustomer,
	});

	const customerId =
		context.fullCustomer.id ?? context.fullCustomer.internal_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "executeMigrateCustomerPlan",
	});
};
