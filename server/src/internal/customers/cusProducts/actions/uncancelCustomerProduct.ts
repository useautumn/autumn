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
import {
	customerProductToPooledBalanceOwnerRestoreOp,
	customerProductToPooledBalanceRestoreOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export type UncancelCustomerProductDependencies = {
	executeAutumnBillingPlan: typeof executeAutumnBillingPlan;
	updateCustomerProduct: typeof CusProductService.update;
	addProductsUpdatedWebhookTask: typeof addProductsUpdatedWebhookTask;
};

/**
 * Uncancels a customer product (reverses a previous cancellation).
 *
 * This action:
 * 1. Clears canceled/canceled_at/ended_at and sets status back to Active
 * 2. Sends products_updated webhook with Renew scenario
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat uncancellation webhooks.
 */
export const uncancelCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	dependencies = {
		executeAutumnBillingPlan,
		updateCustomerProduct: CusProductService.update,
		addProductsUpdatedWebhookTask,
	},
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	dependencies?: UncancelCustomerProductDependencies;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	// 1. Uncancel the product
	const updates: Partial<InsertCustomerProduct> = {
		canceled_at: null,
		canceled: false,
		ended_at: null,
		status: CusProductStatus.Active,
	};

	const pooledBalanceRestore =
		typeof customerProduct.ended_at === "number"
			? customerProductToPooledBalanceRestoreOp({
					customerProduct,
					expectedEffectiveAt: customerProduct.ended_at,
				})
			: undefined;
	const pooledBalanceOps = [
		...(pooledBalanceRestore ? [pooledBalanceRestore] : []),
		...(typeof customerProduct.ended_at === "number"
			? [
					customerProductToPooledBalanceOwnerRestoreOp({
						customerProduct,
						expectedEffectiveAt: customerProduct.ended_at,
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
		`[uncancelCustomerProduct]: uncanceling ${customerProduct.product.name}`,
	);

	// 2. Send webhook
	await dependencies.addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Renew,
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
