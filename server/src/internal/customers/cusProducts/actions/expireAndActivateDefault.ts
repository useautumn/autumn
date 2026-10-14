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
import { notifyAllocationsAdjusted } from "@/internal/balances/allocate/actions/notifyAllocationsAdjusted.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";
import { emitCustomerProductBillingUpdated } from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";
import type { CustomerProductActivation } from "../types/customerProductActivation";

export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
	updates: extraUpdates,
	emitBillingUpdated = false,
	callerEmitsBillingUpdated = false,
	activatedAt = Date.now(),
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
	emitBillingUpdated?: boolean;
	callerEmitsBillingUpdated?: boolean;
	activatedAt?: number;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	activation?: CustomerProductActivation;
	insertedCustomerProduct?: FullCusProduct;
	allocationsAdjusted: boolean;
}> => {
	const { org, env } = ctx;

	const originalFullCustomer = structuredClone(fullCustomer);

	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};

	const { allocationsAdjusted: expiryAdjusted = false } =
		await executeAutumnBillingPlan({
			emitsBillingUpdated: true,
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

	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Expired,
		cusProduct: customerProduct,
	});

	const {
		activation,
		insertedCustomerProduct,
		allocationsAdjusted: successorAdjusted,
	} = await activateFreeSuccessorProduct({
		ctx,
		fromCustomerProduct: customerProduct,
		fullCustomer,
		activatedAt,
		emitsBillingUpdated: true,
	});
	const allocationsAdjusted = expiryAdjusted || successorAdjusted;

	if (emitBillingUpdated) {
		emitCustomerProductBillingUpdated({
			allocationsAdjusted,
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
	} else if (allocationsAdjusted && !callerEmitsBillingUpdated) {
		void notifyAllocationsAdjusted({
			ctx,
			customerId: fullCustomer.id || fullCustomer.internal_id,
		});
	}

	return {
		updates,
		activation,
		insertedCustomerProduct,
		allocationsAdjusted,
	};
};
