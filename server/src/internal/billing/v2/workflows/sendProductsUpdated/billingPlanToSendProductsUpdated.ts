/**
 * Converts an AutumnBillingPlan to sendProductsUpdated workflow triggers.
 * Derives scenario from product status.
 */

import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan.js";
import type { CreateCustomerContext } from "@/internal/customers/actions/createWithDefaults/createCustomerContext";
import { workflows } from "@/queue/workflows.js";

const deriveScenarioFromStatus = (status: string): string => {
	switch (status) {
		case CusProductStatus.Scheduled:
			return "scheduled";
		case CusProductStatus.Active:
			return "new";
		case CusProductStatus.Expired:
			return "expired";
		case CusProductStatus.PastDue:
			return "past_due";
		default:
			return "new";
	}
};

export const billingPlanToSendProductsUpdated = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext | CreateCustomerContext;
}) => {
	// Skip webhooks if test option is set (used in integration tests)
	if (ctx.testOptions?.skipWebhooks) return;

	const { fullCustomer } = billingContext;

	const customerId = fullCustomer.id ?? fullCustomer.internal_id;

	const { insertCustomerProducts } = autumnBillingPlan;

	// Queue for each inserted product
	for (const cusProduct of insertCustomerProducts) {
		const scenario = deriveScenarioFromStatus(cusProduct.status);

		try {
			await workflows.triggerSendProductsUpdated({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				customerProductId: cusProduct.id,
				scenario,
			});

			ctx.logger.info(
				`[billingPlanToSendProductsUpdated] Queued webhook for ${cusProduct.product.name}, scenario: ${scenario}`,
			);
		} catch (error) {
			ctx.logger.error(
				`[billingPlanToSendProductsUpdated] Failed to queue webhook for ${cusProduct.product.name}: ${error}`,
			);
		}
	}
};
