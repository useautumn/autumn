/**
 * Converts an AutumnBillingPlan to sendProductsUpdated workflow triggers.
 * Handles:
 * - New/active product inserts (scenario: "new" or "upgrade" based on expired product)
 * - Cancel updates (scenario: "cancel" or "downgrade" based on scheduled product)
 * - Uncancel updates (scenario: "renew")
 * - Filters out scheduled products from insert webhooks
 */

import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import {
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	isCustomerProductFree,
	isCustomerProductScheduled,
	isProductUpgrade,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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

/**
 * Determines the webhook scenario for an inserted customer product.
 * - "upgrade" if replacing an expired product and new product is more expensive
 * - "new" otherwise (first product, add-on, or no expired product)
 */
const getInsertScenario = ({
	insertedProduct,
	expiredProduct,
}: {
	insertedProduct: FullCusProduct;
	expiredProduct?: FullCusProduct;
}): AttachScenario => {
	// No expired product means this is a new attachment (not a replacement)
	if (!expiredProduct) {
		return AttachScenario.New;
	}

	// Compare prices to determine if it's an upgrade
	const expiredPrices = cusProductToPrices({ cusProduct: expiredProduct });
	const insertedPrices = cusProductToPrices({ cusProduct: insertedProduct });

	const isUpgrade = isProductUpgrade({
		prices1: expiredPrices,
		prices2: insertedPrices,
	});

	return isUpgrade ? AttachScenario.Upgrade : AttachScenario.New;
};

/**
 * Get the expired product from the billing plan's updateCustomerProduct.
 * Returns the customer product if it's being set to "expired" status.
 */
const getExpiredProduct = ({
	updateCustomerProduct,
}: {
	updateCustomerProduct: AutumnBillingPlan["updateCustomerProduct"];
}): FullCusProduct | undefined => {
	if (!updateCustomerProduct) return undefined;

	// Check if the update is setting the status to "expired"
	if (updateCustomerProduct.updates.status === CusProductStatus.Expired) {
		return updateCustomerProduct.customerProduct;
	}

	return undefined;
};

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

	// Get the expired product from updateCustomerProduct (if status is being set to "expired")
	const expiredProduct = getExpiredProduct({ updateCustomerProduct });

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

		const scenario = getInsertScenario({
			insertedProduct: cusProduct,
			expiredProduct,
		});

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
