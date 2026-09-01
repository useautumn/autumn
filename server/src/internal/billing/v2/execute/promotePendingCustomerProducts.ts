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
				// The plan already decided each row's status — a future schedule
				// phase stays Scheduled rather than going live on payment.
				status: plannedCustomerProduct.status,
				metadata_id: null,
				subscription_ids: plannedCustomerProduct.subscription_ids ?? undefined,
				scheduled_ids: plannedCustomerProduct.scheduled_ids ?? undefined,
			},
		});

		promotedIds.add(customerProduct.id);
	}

	autumnBillingPlan.insertCustomerProducts =
		autumnBillingPlan.insertCustomerProducts?.filter(
			(planned) => !promotedIds.has(planned.id),
		) ?? [];
};
