import type {
	AutumnBillingPlan,
	BillingPlan,
	StripeBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { assertStripePlanNoCharges } from "@/internal/billing/v2/providers/stripe/errors/assertStripePlanNoCharges.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { MigrationOperationError } from "@/internal/migrations/v2/operations/errors/index.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { appendMigrationBillingLog } from "@/internal/migrations/v2/operations/utils/index.js";

export type MigrateCustomerStripeBillingPlan = {
	subscriptionId: string;
	billingContext: UpdateSubscriptionBillingContext;
	stripeBillingPlan: StripeBillingPlan;
};

export type MigrateCustomerBillingPlan = BillingPlan & {
	stripeBillingPlans: MigrateCustomerStripeBillingPlan[];
};

const contextBySubscriptionId = ({
	billingContexts,
}: {
	billingContexts: UpdateSubscriptionBillingContext[];
}) => {
	const result = new Map<string, UpdateSubscriptionBillingContext>();
	for (const billingContext of billingContexts) {
		const subscriptionId = billingContext.stripeSubscription?.id;
		if (!subscriptionId) continue;
		if (!result.has(subscriptionId)) result.set(subscriptionId, billingContext);
	}

	return result;
};

/**
 * Build the StripeBillingPlan from a computed AutumnBillingPlan and
 * enforce the no-charges guard:
 *  - throw on `invoiceAction` / `invoiceItemsAction` / `refundAction`
 *  - reject `subscriptionAction` params that would create proration
 *    invoice items
 *
 * Evaluates at most once per Stripe subscription because one migration can
 * patch multiple customer products on the same customer.
 */
export const evaluateMigrateCustomerStripe = async ({
	ctx,
	context,
	billingContexts,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	billingContexts: UpdateSubscriptionBillingContext[];
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<MigrateCustomerBillingPlan> => {
	if (context.migration.no_billing_changes === true) {
		return {
			autumn: autumnBillingPlan,
			stripe: {},
			stripeBillingPlans: [],
		};
	}

	const stripeBillingPlans: MigrateCustomerStripeBillingPlan[] = [];

	for (const [subscriptionId, billingContext] of contextBySubscriptionId({
		billingContexts,
	})) {
		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
		appendMigrationBillingLog({
			ctx,
			key: "stripeBillingPlan",
			log: (logCtx) =>
				logStripeBillingPlan({
					ctx: logCtx,
					stripeBillingPlan,
					billingContext,
				}),
		});

		assertStripePlanNoCharges({
			stripeBillingPlan,
			subscriptionId,
			createError: (violation) =>
				new MigrationOperationError({
					code: "unsupported_operation_input",
					operationType: "update_plan",
					field: "customize",
					message: `Migration update_plan ${violation.message}`,
					details: violation.details,
				}),
		});

		stripeBillingPlans.push({
			subscriptionId,
			billingContext,
			stripeBillingPlan,
		});
	}

	return {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlans[0]?.stripeBillingPlan ?? {},
		stripeBillingPlans,
	};
};
