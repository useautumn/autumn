import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { withoutCustomCatalogRows } from "@/internal/billing/v2/utils/billingPlan/withoutCustomCatalogRows";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";

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
	// A deferral that replaced another may run before the replaced one's pending rows move across.
	const pendingIds = new Set(pendingCustomerProducts.map(({ id }) => id));
	const plannedIds = new Set(
		(autumnBillingPlan.insertCustomerProducts ?? []).map(({ id }) => id),
	);
	if (plannedIds.size > pendingIds.size) {
		const customerPendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		pendingCustomerProducts.push(
			...customerPendingRows.filter(
				({ id }) => plannedIds.has(id) && !pendingIds.has(id),
			),
		);
	}

	if (!pendingCustomerProducts.length) return autumnBillingPlan;

	const promotedIds = new Set<string>();

	for (const customerProduct of pendingCustomerProducts) {
		const plannedCustomerProduct =
			autumnBillingPlan.insertCustomerProducts?.find(
				(planned) => planned.id === customerProduct.id,
			);
		if (!plannedCustomerProduct) continue;

		// Checkout can change quantities after the pending rows were inserted.
		for (const customerEntitlement of plannedCustomerProduct.customer_entitlements) {
			await CusEntService.update({
				ctx,
				id: customerEntitlement.id,
				updates: {
					balance: customerEntitlement.balance ?? undefined,
					entities: customerEntitlement.entities,
				},
				incrementCacheVersion: true,
			});
		}

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				options: plannedCustomerProduct.options,
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

	return {
		...withoutCustomCatalogRows(autumnBillingPlan),
		insertCustomerProducts:
			autumnBillingPlan.insertCustomerProducts?.filter(
				(planned) => !promotedIds.has(planned.id),
			) ?? [],
	};
};
