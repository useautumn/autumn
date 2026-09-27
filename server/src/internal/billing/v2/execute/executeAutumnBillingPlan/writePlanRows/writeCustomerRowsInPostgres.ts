import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";
import { executePatchCustomerProducts } from "@/internal/billing/v2/execute/executeAutumnActions/executePatchCustomerProducts";
import { insertCustomerProductRows } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { updateCustomerEntitlements } from "@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { executePooledBalancePlan } from "@/internal/billing/v2/pooledBalances/execute/executePooledBalancePlan";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

/** The rows the balance worker holds, pools included, written to Postgres in plan order. A customer insert that finds the row taken stops here. */
export const writeCustomerRowsInPostgres = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<AutumnBillingPlanResult> => {
	const { db } = ctx;
	const {
		insertCustomer,
		updateCustomer,
		insertCustomerEntitlements,
		patchCustomerProducts,
		insertEntities,
		claimEntities,
		insertCustomerProducts,
		lockCustomerCurrency,
		updateCustomerEntitlements: customerEntitlementUpdates,
	} = autumnBillingPlan;

	if (insertCustomer) {
		const { customer, wasUpdate } = await CusService.insertOrClaimEmail({
			db,
			data: insertCustomer,
		});
		if (wasUpdate)
			return {
				status: "customer_exists",
				internalCustomerId: customer.internal_id,
			};
	}

	if (updateCustomer && Object.keys(updateCustomer.updates).length > 0) {
		await CusService.update({
			ctx,
			idOrInternalId: updateCustomer.customer.internal_id,
			update: updateCustomer.updates,
		});
	}

	if (insertCustomerEntitlements) {
		await CusEntService.insert({ ctx, data: insertCustomerEntitlements });
	}

	// Custom prices/entitlements from the catalog step must exist before customer rows reference them.
	if (patchCustomerProducts) {
		await executePatchCustomerProducts({ ctx, patchCustomerProducts });
	}

	if (insertEntities?.length) {
		await EntityService.insert({ db, data: insertEntities });
	}

	for (const { entity, updates } of claimEntities ?? []) {
		await EntityService.claim({
			db,
			internalId: entity.internal_id,
			update: updates,
		});
	}

	await insertCustomerProductRows({
		ctx,
		customerProducts: insertCustomerProducts,
	});

	// Lock / relock customer currency. No-op when already the target currency.
	if (lockCustomerCurrency) {
		await CusService.lockCurrencyIfUnset({
			ctx,
			internalCustomerId: lockCustomerCurrency.internalCustomerId,
			currency: lockCustomerCurrency.currency,
		});
	}

	for (const { customerProduct, updates } of getUpdateCustomerProducts({
		autumnBillingPlan,
	})) {
		// Drizzle throws "No values to set" on an empty SET (e.g. discount-only flows register an empty entry).
		if (!updates || Object.keys(updates).length === 0) continue;
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});
	}

	for (const customerProduct of getDeleteCustomerProducts({
		autumnBillingPlan,
	})) {
		ctx.logger.debug(
			`[executeAutumnBillingPlan] deleting scheduled customer product: ${customerProduct.product.id}`,
		);
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}

	await updateCustomerEntitlements({
		ctx,
		customerId: autumnBillingPlan.customerId,
		updates: customerEntitlementUpdates,
	});

	await executePooledBalancePlan({
		ctx,
		pooledBalancePlan: autumnBillingPlan.pooledBalancePlan,
	});

	return { status: "applied" };
};
