import { type AutumnBillingPlan, CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const promotePendingCustomerProducts = async ({
	ctx,
	autumnBillingPlan,
	metadataId,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
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

	for (const customerProduct of pendingCustomerProducts) {
		const plannedCustomerProduct =
			autumnBillingPlan.insertCustomerProducts?.find(
				(planned) => planned.id === customerProduct.id,
			);

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				status: CusProductStatus.Active,
				metadata_id: null,
				subscription_ids: plannedCustomerProduct?.subscription_ids ?? undefined,
				scheduled_ids: plannedCustomerProduct?.scheduled_ids ?? undefined,
			},
		});
	}

	autumnBillingPlan.insertCustomerProducts = [];
};
