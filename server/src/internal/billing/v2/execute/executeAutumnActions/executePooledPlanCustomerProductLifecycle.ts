import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "../../utils/billingPlan/customerProductPlanMutations.js";
import { executeCustomerLicenseUpdates } from "./executeCustomerLicenseUpdates.js";
import { executePatchCustomerProducts } from "./executePatchCustomerProducts.js";
import {
	executePooledBalanceOps,
	type PooledBalanceTransactionCallback,
} from "./executePooledBalanceOps.js";
import { insertNewCusProducts } from "./insertNewCusProducts.js";

export type ExecutePooledPlanCustomerProductLifecycleDependencies = {
	executePooledBalanceOps: typeof executePooledBalanceOps;
	patchCustomerProducts: typeof executePatchCustomerProducts;
	insertNewCustomerProducts: typeof insertNewCusProducts;
	insertEntities: typeof EntityService.insert;
	executeCustomerLicenseUpdates: typeof executeCustomerLicenseUpdates;
	updateCustomerProduct: (
		args: Parameters<typeof CusProductService.update>[0],
	) => Promise<unknown>;
	deleteCustomerProduct: (
		args: Parameters<typeof CusProductService.delete>[0],
	) => Promise<unknown>;
};

export const executePooledPlanCustomerProductLifecycle = async ({
	ctx,
	autumnBillingPlan,
	afterCustomerProductInserts,
	beforeRebalance,
	dependencies = {
		executePooledBalanceOps,
		patchCustomerProducts: executePatchCustomerProducts,
		insertNewCustomerProducts: insertNewCusProducts,
		insertEntities: EntityService.insert,
		executeCustomerLicenseUpdates,
		updateCustomerProduct: CusProductService.update,
		deleteCustomerProduct: CusProductService.delete,
	},
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	afterCustomerProductInserts?: PooledBalanceTransactionCallback;
	beforeRebalance?: PooledBalanceTransactionCallback;
	dependencies?: ExecutePooledPlanCustomerProductLifecycleDependencies;
}): Promise<boolean> => {
	const { pooledBalancePlan, pooledBalanceOps } = autumnBillingPlan;
	const hasPooledBalanceWork =
		(pooledBalancePlan?.removeSources?.length ?? 0) > 0 ||
		(pooledBalancePlan?.upsertSources?.length ?? 0) > 0 ||
		(pooledBalanceOps?.length ?? 0) > 0;
	if (!hasPooledBalanceWork) return false;

	const updateCustomerProducts = getUpdateCustomerProducts({
		autumnBillingPlan,
	});
	const deleteCustomerProducts = getDeleteCustomerProducts({
		autumnBillingPlan,
	});

	await dependencies.executePooledBalanceOps({
		ctx,
		customerId: autumnBillingPlan.customerId,
		pooledBalancePlan,
		pooledBalanceOps,
		beforeDatabaseOperations: async ({ db }) => {
			const transactionContext = { ...ctx, db };
			if (autumnBillingPlan.insertEntities?.length) {
				await dependencies.insertEntities({
					db,
					data: autumnBillingPlan.insertEntities,
				});
			}
			await dependencies.executeCustomerLicenseUpdates({
				ctx: transactionContext,
				customerLicenseUpdates: autumnBillingPlan.customerLicenseUpdates,
			});
			if (autumnBillingPlan.patchCustomerProducts) {
				await dependencies.patchCustomerProducts({
					ctx: transactionContext,
					patchCustomerProducts: autumnBillingPlan.patchCustomerProducts,
				});
			}
			await dependencies.insertNewCustomerProducts({
				ctx: transactionContext,
				newCusProducts: autumnBillingPlan.insertCustomerProducts,
			});
			await afterCustomerProductInserts?.({ db });
		},
		beforeRebalance: async ({ db }) => {
			const transactionContext = { ...ctx, db };
			for (const { customerProduct, updates } of updateCustomerProducts) {
				if (!updates || Object.keys(updates).length === 0) continue;
				await dependencies.updateCustomerProduct({
					ctx: transactionContext,
					cusProductId: customerProduct.id,
					updates,
				});
			}

			for (const deleteCustomerProduct of deleteCustomerProducts) {
				ctx.logger.debug(
					`[executeAutumnBillingPlan] deleting scheduled customer product: ${deleteCustomerProduct.product.id}`,
				);
				await dependencies.deleteCustomerProduct({
					ctx: transactionContext,
					cusProductId: deleteCustomerProduct.id,
				});
			}
			await beforeRebalance?.({ db });
		},
	});

	return true;
};
