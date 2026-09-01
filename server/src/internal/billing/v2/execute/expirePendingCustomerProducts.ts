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

	await expireCustomerProducts({
		ctx,
		customerProducts: pendingCustomerProducts,
	});
};
