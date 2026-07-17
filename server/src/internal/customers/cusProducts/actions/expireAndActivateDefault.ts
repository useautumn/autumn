import {
	AttachScenario,
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";

export type PreparedCustomerProductExpiry = {
	customerProduct: FullCusProduct;
	updates: Partial<InsertCustomerProduct>;
	autumnBillingPlan: AutumnBillingPlan;
};

export const prepareCustomerProductExpiry = ({
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
}: {
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
}): PreparedCustomerProductExpiry => {
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};
	const pooledBalanceRemoval = customerProductToPooledBalanceRemovalOp({
		customerProduct,
		effectiveAt: null,
	});

	return {
		customerProduct,
		updates,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				},
			],
			pooledBalanceOps: pooledBalanceRemoval
				? [pooledBalanceRemoval]
				: undefined,
		},
	};
};

export const completeCustomerProductExpiry = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates: Partial<InsertCustomerProduct>;
}): Promise<{
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org: ctx.org,
		env: ctx.env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Expired,
		cusProduct: customerProduct,
	});

	fullCustomer.customer_products = fullCustomer.customer_products.map(
		(fullCustomerProduct) =>
			fullCustomerProduct.id === customerProduct.id
				? ({ ...fullCustomerProduct, ...updates } as FullCusProduct)
				: fullCustomerProduct,
	);

	return activateFreeSuccessorProduct({
		ctx,
		fromCustomerProduct: customerProduct,
		fullCustomer,
	});
};

/** Expires a customer product and activates its free successor when needed. */
export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const preparedExpiry = prepareCustomerProductExpiry({
		customerProduct,
		fullCustomer,
		updates: extraUpdates,
	});

	// Executing through the shared plan runs the license lifecycle when the
	// expiring product carried license state.
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: preparedExpiry.autumnBillingPlan,
	});

	ctx.logger.debug(
		`[expireCustomerProduct]: expiring ${customerProduct.product.name}`,
	);

	const { activatedCustomerProduct, insertedCustomerProduct } =
		await completeCustomerProductExpiry({
			ctx,
			fullCustomer,
			customerProduct,
			updates: preparedExpiry.updates,
		});

	return {
		updates: preparedExpiry.updates,
		activatedCustomerProduct,
		insertedCustomerProduct,
	};
};
