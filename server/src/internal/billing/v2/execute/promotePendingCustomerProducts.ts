import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { loadPlannedCustomerProducts } from "@/internal/billing/v2/execute/loadPlannedCustomerProducts";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Promotes pending rows in place and drops every already-materialized row
 * from the plan, so a webhook retry after a partial execution never
 * re-inserts what the first attempt already wrote.
 */
export const promotePendingCustomerProducts = async ({
	ctx,
	autumnBillingPlan,
	fullCustomer,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	fullCustomer: FullCustomer;
}) => {
	const existingCustomerProducts = await loadPlannedCustomerProducts({
		ctx,
		autumnBillingPlan,
	});

	if (!existingCustomerProducts.length) return autumnBillingPlan;

	const existingIds = new Set(
		existingCustomerProducts.map((customerProduct) => customerProduct.id),
	);

	for (const customerProduct of existingCustomerProducts) {
		if (customerProduct.status !== CusProductStatus.Pending) continue;

		const plannedCustomerProduct =
			autumnBillingPlan.insertCustomerProducts.find(
				(planned) => planned.id === customerProduct.id,
			);
		if (!plannedCustomerProduct) continue;

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				status: plannedCustomerProduct.status,
				metadata_id: null,
				subscription_ids: plannedCustomerProduct.subscription_ids ?? undefined,
				scheduled_ids: plannedCustomerProduct.scheduled_ids ?? undefined,
			},
		});

		if (plannedCustomerProduct.status === CusProductStatus.Active) {
			await reapplyExistingRolloversToCustomerProduct({
				ctx,
				fullCustomer,
				customerProduct,
			});
		}
	}

	return {
		...autumnBillingPlan,
		customPrices: undefined,
		customEntitlements: undefined,
		customFreeTrial: undefined,
		insertCustomerProducts: autumnBillingPlan.insertCustomerProducts.filter(
			(planned) => !existingIds.has(planned.id),
		),
	};
};
