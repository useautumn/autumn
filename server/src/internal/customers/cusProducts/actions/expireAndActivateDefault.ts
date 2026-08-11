import {
	AttachScenario,
	CusProductStatus,
	type CustomerProductUpdates,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	type BillingChangeCollector,
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";
import { emitBillingUpdated } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/emitBillingUpdated";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";

/**
 * Expires a customer product and activates the default product if needed.
 *
 * This action:
 * 1. Sets status to Expired
 * 2. Sends the products_updated (Expired) webhook
 * 3. Activates free successor (scheduled or default) if no other active product in group
 * 4. Records the transitions on `collector` when given, otherwise emits
 *    billing.updated itself
 *
 * @returns updates - The updates applied to the expired customer product
 * @returns expiredCustomerProduct - The expired product with `updates` applied
 * @returns activatedCustomerProduct - If a scheduled product was activated (UPDATE)
 * @returns insertedCustomerProduct - If a new default product was created (INSERT)
 */
export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
	collector,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: CustomerProductUpdates;
	collector?: BillingChangeCollector;
}): Promise<{
	updates: CustomerProductUpdates;
	expiredCustomerProduct: FullCusProduct;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { org, env } = ctx;

	const originalFullCustomer = structuredClone(fullCustomer);

	// 1. Expire the product
	const updates: CustomerProductUpdates = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};
	const expiredCustomerProduct = {
		...customerProduct,
		...updates,
	} as FullCusProduct;

	// Executing through the shared plan runs the license lifecycle when the
	// expiring product carried license state.
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [{ customerProduct, updates }],
		},
	});

	ctx.logger.debug(
		`[expireCustomerProduct]: expiring ${customerProduct.product.name}`,
	);

	// Update full customer
	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id ? expiredCustomerProduct : cp,
	);

	// 2. Send products_updated (Expired) — must be enqueued before successor
	// activation, which enqueues its own products_updated (New).
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Expired,
		cusProduct: customerProduct,
	});

	// 3. Activate free successor (scheduled or default)
	const { activatedCustomerProduct, insertedCustomerProduct } =
		await activateFreeSuccessorProduct({
			ctx,
			fromCustomerProduct: customerProduct,
			fullCustomer,
		});

	// 4. Record the transitions (payload needs the activated/inserted products).
	// Entry order feeds plan-change collapsing, so expired must land first.
	if (collector) {
		trackCustomerProductUpdate({ collector, customerProduct, updates });

		if (activatedCustomerProduct) {
			trackCustomerProductUpdate({
				collector,
				customerProduct: activatedCustomerProduct,
				updates: { status: CusProductStatus.Active },
			});
		}

		if (insertedCustomerProduct) {
			trackCustomerProductInsertion({
				collector,
				customerProduct: insertedCustomerProduct,
			});
		}
	} else {
		emitBillingUpdated({
			ctx,
			originalFullCustomer,
			updateCustomerProducts: [
				{ customerProduct, updates },
				...(activatedCustomerProduct
					? [
							{
								customerProduct: activatedCustomerProduct,
								updates: { status: CusProductStatus.Active },
							},
						]
					: []),
			],
			insertCustomerProducts: insertedCustomerProduct
				? [insertedCustomerProduct]
				: [],
		});
	}

	return {
		updates,
		expiredCustomerProduct,
		activatedCustomerProduct,
		insertedCustomerProduct,
	};
};
