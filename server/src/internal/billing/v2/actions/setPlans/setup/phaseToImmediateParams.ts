import type { SetPlansParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import type { ImmediateMultiProductParams } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";

const resolveNoBillingChanges = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
}) =>
	params.no_billing_changes === true ||
	(!isStripeConnected({ org: ctx.org, env: ctx.env }) &&
		params.proration_behavior === "none" &&
		params.redirect_mode === "never");

/** The multi-attach params that bill one phase's plans now. */
export const phaseToImmediateParams = ({
	ctx,
	params,
	phase,
}: {
	ctx: AutumnContext;
	params: SetPlansParamsV0;
	phase: SetPlansParamsV0["phases"][number];
}): ImmediateMultiProductParams => ({
	customer_id: params.customer_id,
	entity_id: params.entity_id,
	no_billing_changes: resolveNoBillingChanges({ ctx, params }),
	// Unscheduled plans bill with the immediate phase, so they attach alongside
	// it — always last, which is how the contexts are told apart afterwards.
	plans: [...phase.plans, ...(params.unscheduled_plans ?? [])].map((plan) => ({
		plan_id: plan.plan_id,
		entity_id: plan.entity_id,
		customize: plan.customize,
		feature_quantities: plan.feature_quantities,
		license_quantities: plan.license_quantities,
		version: plan.version,
		subscription_id: plan.subscription_id,
	})),
	invoice_mode: params.invoice_mode,
	free_trial: params.free_trial,
	currency: params.currency,
	discounts: params.discounts,
	success_url: params.success_url,
	checkout_session_params: params.checkout_session_params,
	redirect_mode: params.redirect_mode ?? "if_required",
	enable_plan_immediately: params.enable_plan_immediately,
	processor_subscription_id: params.stripe_subscription_id,
});
