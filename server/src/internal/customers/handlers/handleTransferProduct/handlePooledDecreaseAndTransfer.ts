import {
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	executePooledBalanceOps,
	type PooledBalanceTransactionCallback,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts.js";
import { customerProductHasPooledSource } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { CusEntService } from "../../cusProducts/cusEnts/CusEntitlementService.js";
import { computePooledSplitTransferPlan } from "./computePooledTransferPlan.js";

export const handlePooledDecreaseAndTransfer = async ({
	ctx,
	fullCustomer,
	customerProduct,
	toEntity,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	toEntity?: Entity | null;
}): Promise<FullCusProduct> => {
	const plan = computePooledSplitTransferPlan({
		fullCustomer,
		customerProduct,
		toEntity: toEntity ?? null,
		now: Date.now(),
	});
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	if (!customerId) {
		throw new InternalError({
			message: "Cannot transfer a pooled product without a customer ID.",
		});
	}
	const destinationIsManaged = customerProductHasPooledSource({
		customerProduct: plan.transferredCustomerProduct,
	});
	const insertTransferredCustomerProduct: PooledBalanceTransactionCallback =
		async ({ db }) => {
			await insertNewCusProducts({
				ctx: { ...ctx, db },
				newCusProducts: [plan.transferredCustomerProduct],
			});
		};

	await executePooledBalanceOps({
		ctx,
		customerId,
		pooledBalanceOps: plan.pooledBalanceOps,
		beforeDatabaseOperations: async ({ db }) => {
			const transactionContext = { ...ctx, db };
			if (destinationIsManaged) {
				await insertTransferredCustomerProduct({ db });
			}
			await CusProductService.update({
				ctx: transactionContext,
				cusProductId: customerProduct.id,
				updates: { quantity: plan.sourceQuantity },
			});

			for (const decrement of plan.sourceOrdinaryBalanceDecrements) {
				await CusEntService.decrement({
					ctx: transactionContext,
					id: decrement.customerEntitlementId,
					amount: decrement.amount,
				});
			}
		},
		afterRebalance: async ({ db }) => {
			if (!destinationIsManaged) {
				await insertTransferredCustomerProduct({ db });
			}
		},
	});

	return plan.transferredCustomerProduct;
};
