import {
	AttachScenario,
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";
import { emitCustomerProductBillingUpdated } from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";
import type { CustomerProductActivation } from "../types/customerProductActivation";

/** Billing webhook emission is opt-in because some callers batch their own events. */
export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
	emitBillingUpdated = false,
	activatedAt = Date.now(),
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
	emitBillingUpdated?: boolean;
	activatedAt?: number;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	activation?: CustomerProductActivation;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { org, env } = ctx;

	const originalFullCustomer = structuredClone(fullCustomer);

	// 1. Expire the product
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				},
			],
		},
	});

	ctx.logger.debug(
		`[expireCustomerProduct]: expiring ${customerProduct.product.name}`,
	);

	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
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
	const { activation, insertedCustomerProduct } =
		await activateFreeSuccessorProduct({
			ctx,
			fromCustomerProduct: customerProduct,
			fullCustomer,
			activatedAt,
		});

	// 4. Emit billing.updated (payload needs the activated/inserted products)
	if (emitBillingUpdated) {
		emitCustomerProductBillingUpdated({
			ctx,
			originalFullCustomer,
			updateCustomerProducts: [
				{ customerProduct, updates },
				...(activation
					? [
							{
								customerProduct: activation.before,
								updates: { status: activation.after.status },
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
		activation,
		insertedCustomerProduct,
	};
};
