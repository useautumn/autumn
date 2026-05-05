import type {
	AutumnBillingPlan,
	RestoreParamsV1,
	RestoreResponse,
	RestoreSubscriptionResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { handleRestoreErrors } from "./errors/handleRestoreErrors";
import { buildRestoreBillingContext } from "./setup/buildRestoreBillingContext";
import { setupRestoreContext } from "./setup/setupRestoreContext";

export const restore = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: RestoreParamsV1;
}): Promise<RestoreResponse> => {
	const { customer_id: customerId } = params;

	const { fullCustomer, stripeCustomer, subscriptionIds } =
		await setupRestoreContext({ ctx, customerId });

	const restored: RestoreSubscriptionResult[] = [];

	for (const stripeSubscriptionId of subscriptionIds) {
		const billingContext = await buildRestoreBillingContext({
			ctx,
			fullCustomer,
			stripeCustomer,
			stripeSubscriptionId,
		});

		const autumnBillingPlan: AutumnBillingPlan = {
			customerId,
			insertCustomerProducts: [],
		};

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		handleRestoreErrors({ stripeBillingPlan, stripeSubscriptionId });

		await executeStripeBillingPlan({
			ctx,
			billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
			billingContext,
		});

		restored.push({
			stripe_subscription_id: stripeSubscriptionId,
			stripe_schedule_id: billingContext.stripeSubscriptionSchedule?.id ?? null,
			sub_action: stripeBillingPlan.subscriptionAction ? "update" : "noop",
			schedule_action: stripeBillingPlan.subscriptionScheduleAction
				? (stripeBillingPlan.subscriptionScheduleAction.type as
						| "update"
						| "create")
				: "noop",
		});
	}

	return {
		customer_id: customerId,
		restored,
	};
};
