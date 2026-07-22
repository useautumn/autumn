import {
	AttachScenario,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	customerProductToPooledBalanceOwnerRemovalOp,
	customerProductToPooledBalanceRemovalOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export type CancelCustomerProductDependencies = {
	executeAutumnBillingPlan: typeof executeAutumnBillingPlan;
	updateCustomerProduct: typeof CusProductService.update;
	addProductsUpdatedWebhookTask: typeof addProductsUpdatedWebhookTask;
};

/**
 * Cancels a customer product (marks it as canceled with a future end date).
 *
 * This action:
 * 1. Sets canceled=true, canceled_at, and ended_at on the customer product
 * 2. Sends products_updated webhook with Cancel scenario
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat cancellation webhooks and any external cancellation flow.
 */
export const cancelCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	endedAt,
	dependencies = {
		executeAutumnBillingPlan,
		updateCustomerProduct: CusProductService.update,
		addProductsUpdatedWebhookTask,
	},
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	endedAt?: number | null;
	dependencies?: CancelCustomerProductDependencies;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	// 1. Cancel the product
	const updates: Partial<InsertCustomerProduct> = {
		canceled_at: Date.now(),
		canceled: true,
		ended_at: endedAt ?? undefined,
	};

	const pooledBalanceRemoval = customerProductToPooledBalanceRemovalOp({
		customerProduct,
		effectiveAt: typeof endedAt === "number" ? endedAt : null,
	});
	const pooledBalanceOps = [
		...(pooledBalanceRemoval ? [pooledBalanceRemoval] : []),
		...(typeof endedAt === "number"
			? [
					customerProductToPooledBalanceOwnerRemovalOp({
						customerProduct,
						effectiveAt: endedAt,
					}),
				]
			: []),
	];
	if (pooledBalanceOps.length > 0) {
		await dependencies.executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: [],
				updateCustomerProducts: [
					{
						customerProduct,
						updates: updates as CustomerProductUpdate["updates"],
					},
				],
				pooledBalanceOps,
			},
		});
	} else {
		await dependencies.updateCustomerProduct({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});
	}

	ctx.logger.debug(
		`[cancelCustomerProduct]: canceling ${customerProduct.product.name}`,
	);

	// 2. Send webhook
	await dependencies.addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Cancel,
		cusProduct: customerProduct,
	});

	// 3. Update full customer in memory
	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

	return { updates };
};
