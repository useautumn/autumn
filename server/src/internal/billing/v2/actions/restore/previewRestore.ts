import type {
	AutumnBillingPlan,
	RestoreParamsV1,
	StripeBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { buildBillingVersionUpdates } from "./compute/buildBillingVersionUpdates";
import { handleRestoreErrors } from "./errors/handleRestoreErrors";
import { buildRestoreBillingContext } from "./setup/buildRestoreBillingContext";
import { setupRestoreContext } from "./setup/setupRestoreContext";

export type RestorePreviewEntry = {
	stripe_subscription_id: string;
	stripe_schedule_id: string | null;
	stripe_billing_plan: StripeBillingPlan;
};

export type RestorePreviewResponse = {
	customer_id: string;
	previews: RestorePreviewEntry[];
};

/** Dry-run restore — evaluates the billing plan(s) without executing them. */
export const previewRestore = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: RestoreParamsV1;
}): Promise<RestorePreviewResponse> => {
	const { customer_id: customerId, subscription_ids: subscriptionIdsFilter } =
		params;

	const { fullCustomer, stripeCustomer, subscriptionIds } =
		await setupRestoreContext({ ctx, customerId, subscriptionIdsFilter });

	const previews: RestorePreviewEntry[] = [];

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
			updateCustomerProducts: buildBillingVersionUpdates({
				fullCustomer,
				stripeSubscriptionId,
			}),
		};

		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		handleRestoreErrors({ stripeBillingPlan, stripeSubscriptionId });

		previews.push({
			stripe_subscription_id: stripeSubscriptionId,
			stripe_schedule_id: billingContext.stripeSubscriptionSchedule?.id ?? null,
			stripe_billing_plan: stripeBillingPlan,
		});
	}

	return { customer_id: customerId, previews };
};
