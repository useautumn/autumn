/**
 * Converts an AutumnBillingPlan to sendProductsUpdated workflow triggers.
 * Handles:
 * - New/active product inserts (scenario: "new")
 * - Cancel updates (scenario: "cancel" or "downgrade" based on scheduled product)
 * - Uncancel updates (scenario: "renew")
 * - Filters out scheduled products from insert webhooks
 */

import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductFree,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	AutumnBillingPlan,
	BillingContext,
} from "@autumn/shared";
import type { CreateCustomerContext } from "@/internal/customers/actions/createWithDefaults/createCustomerContext";
import { workflows } from "@/queue/workflows.js";

// ============================================================================
// HELPERS
// ============================================================================

/** Check if any scheduled product in the list is paid (not free) */
const hasPaidScheduledProduct = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): boolean => {
	return customerProducts.some(
		(cp) =>
			cp.status === CusProductStatus.Scheduled && !isCustomerProductFree(cp),
	);
};

/**
 * Get the webhook scenario for an updateCustomerProduct, or null if no webhook needed.
 * - Cancel: canceled=true with timestamps set → "cancel" or "downgrade"
 * - Uncancel: canceled=false with timestamps cleared → "renew"
 */
const getUpdateScenario = ({
	updates,
	insertCustomerProducts,
}: {
	updates: {
		canceled?: boolean | null;
		canceled_at?: number | null;
		ended_at?: number | null;
	};
	insertCustomerProducts: FullCusProduct[];
}): AttachScenario | null => {
	// Cancel: canceled=true with timestamps set
	if (
		updates.canceled === true &&
		updates.canceled_at != null &&
		updates.ended_at != null
	) {
		return hasPaidScheduledProduct({ customerProducts: insertCustomerProducts })
			? AttachScenario.Downgrade
			: AttachScenario.Cancel;
	}

	// Uncancel: canceled=false with timestamps cleared
	if (
		updates.canceled === false &&
		updates.canceled_at === null &&
		updates.ended_at === null
	) {
		return AttachScenario.Renew;
	}

	return null;
};

// /** Derive webhook scenario from customer product status (for inserts) */
// const deriveScenarioFromStatus = ({ status }: { status: string }): string => {
// 	switch (status) {
// 		case CusProductStatus.Active:
// 			return AttachScenario.New;
// 		case CusProductStatus.Expired:
// 			return AttachScenario.Expired;
// 		case CusProductStatus.PastDue:
// 			return AttachScenario.PastDue;
// 		default:
// 			return AttachScenario.New;
// 	}
// };

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export const billingPlanToSendProductsUpdated = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext | CreateCustomerContext;
}) => {
	if (ctx.testOptions?.skipWebhooks) return;

	const { fullCustomer } = billingContext;
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	const { insertCustomerProducts, updateCustomerProduct } = autumnBillingPlan;

	// A. Handle cancel/uncancel webhook for updateCustomerProduct
	if (updateCustomerProduct) {
		const scenario = getUpdateScenario({
			updates: updateCustomerProduct.updates,
			insertCustomerProducts,
		});

		if (scenario) {
			try {
				await workflows.triggerSendProductsUpdated({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId,
					customerProductId: updateCustomerProduct.customerProduct.id,
					scenario,
				});

				ctx.logger.info(
					`[billingPlanToSendProductsUpdated] Queued ${scenario} webhook for ${updateCustomerProduct.customerProduct.product.name}`,
				);
			} catch (error) {
				ctx.logger.error(
					`[billingPlanToSendProductsUpdated] Failed to queue ${scenario} webhook for ${updateCustomerProduct.customerProduct.product.name}: ${error}`,
				);
			}
		}
	}

	// B. Queue webhooks for inserted products (excluding scheduled ones)
	for (const cusProduct of insertCustomerProducts) {
		if (isCustomerProductScheduled(cusProduct)) continue;

		// const scenario = deriveScenarioFromStatus({ status: cusProduct.status });
		const scenario = AttachScenario.New;

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
