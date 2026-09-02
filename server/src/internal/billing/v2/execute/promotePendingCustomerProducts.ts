import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const promotePendingCustomerProducts = async ({
	ctx,
	autumnBillingPlan,
	fullCustomer,
	metadataId,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	fullCustomer: FullCustomer;
	metadataId: string;
}) => {
	const pendingCustomerProducts = await CusProductService.getByMetadataId({
		db: ctx.db,
		metadataId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Pending],
	});

	if (!pendingCustomerProducts.length) return;

	const promotedIds = new Set<string>();

	for (const customerProduct of pendingCustomerProducts) {
		const plannedCustomerProduct =
			autumnBillingPlan.insertCustomerProducts?.find(
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

		promotedIds.add(customerProduct.id);
	}

	autumnBillingPlan.insertCustomerProducts =
		autumnBillingPlan.insertCustomerProducts?.filter(
			(planned) => !promotedIds.has(planned.id),
		) ?? [];
};
