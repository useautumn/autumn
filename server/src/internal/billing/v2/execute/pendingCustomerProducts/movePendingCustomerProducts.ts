import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/** Hands a deferred plan's pending customer_products to the deferral that replaced it. */
export const movePendingCustomerProducts = async ({
	ctx,
	fromMetadataId,
	toMetadataId,
}: {
	ctx: AutumnContext;
	fromMetadataId: string;
	toMetadataId: string;
}) => {
	const pendingCustomerProducts = await CusProductService.getByMetadataId({
		db: ctx.db,
		metadataId: fromMetadataId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Pending],
	});

	for (const customerProduct of pendingCustomerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { metadata_id: toMetadataId },
		});
	}
};
