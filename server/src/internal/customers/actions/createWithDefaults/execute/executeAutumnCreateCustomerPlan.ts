import type { AutumnBillingPlan } from "@autumn/shared";
import { AuthType, CustomerExpand } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import type { CreateCustomerContext } from "@/internal/customers/actions/createWithDefaults/createCustomerContext.js";
import { syncAutoTopupPurchaseLimitCounts } from "@/internal/customers/actions/update/syncAutoTopupPurchaseLimitCounts.js";
import { setCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import { captureOrgEvent } from "@/utils/posthog.js";
import { CusService } from "../../../CusService.js";

export type ExecuteAutumnResult = { type: "created" } | { type: "existing" };

/**
 * Execute the Autumn (DB) part of customer creation: one plan that inserts the customer and its
 * default products, or finds another request created it first and returns the existing customer.
 *
 * Does NOT emit webhooks — the caller emits after the Stripe customer id is
 * persisted, so webhook consumers calling customers.get see a non-null
 * stripe_id (see createCustomerWithDefaults).
 */
export const executeAutumnCreateCustomerPlan = async ({
	ctx,
	context,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<ExecuteAutumnResult> => {
	const { logger } = ctx;
	const { fullCustomer } = context;

	const result = await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	if (result.status === "customer_exists") {
		logger.info(
			`Customer already exists (claimed or existing): ${fullCustomer.id || fullCustomer.internal_id}`,
		);
		setCustomerCreationRecoveryStage({ ctx, stage: "existing" });
		context.fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId:
				result.internalCustomerId ??
				(fullCustomer.id || fullCustomer.internal_id),
			withEntities: true,
			withSubs: true,
			expand: [CustomerExpand.Invoices],
		});
		return { type: "existing" };
	}

	await syncAutoTopupPurchaseLimitCounts({
		ctx,
		customer: fullCustomer,
		autoTopups: context.autoTopups ?? [],
	});

	setCustomerCreationRecoveryStage({ ctx, stage: "autumn_committed" });

	if (ctx.authType === AuthType.SecretKey) {
		await captureOrgEvent({
			orgId: ctx.org.id,
			event: "customer_created_via_api",
			properties: {
				org_slug: ctx.org.slug,
				customer_id: fullCustomer.id || fullCustomer.internal_id,
				env: ctx.env,
			},
		});
	}

	return { type: "created" };
};
