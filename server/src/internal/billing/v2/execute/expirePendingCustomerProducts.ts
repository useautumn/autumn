import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const expireCustomerProducts = async ({
	ctx,
	customerProducts,
}: {
	ctx: RepoContext;
	customerProducts: FullCusProduct[];
}) => {
	const now = Date.now();

	for (const customerProduct of customerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: now,
				metadata_id: null,
			},
		});
	}
};

/** Expires only rows still awaiting payment, so a promotion that lands first
 * is never overwritten. */
export const expirePendingCustomerProducts = async ({
	ctx,
	metadataId,
}: {
	ctx: RepoContext;
	metadataId: string;
}) => {
	const pendingCustomerProducts = await CusProductService.getByMetadataId({
		db: ctx.db,
		metadataId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Pending],
	});

	for (const customerProduct of pendingCustomerProducts) {
		await CusProductService.expireIfPending({
			ctx,
			cusProductId: customerProduct.id,
		});
	}
};
