import type { RepoContext } from "@/db/repoContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import {
	expireCustomerProducts,
	expirePendingCustomerProducts,
} from "./expirePendingCustomerProducts";

/**
 * Expires what an unpaid checkout granted: active rows linked by session that never
 * got a subscription, and pending rows linked by metadata. Then drops the metadata.
 */
export const expireAbandonedCheckoutCustomerProducts = async ({
	ctx,
	stripeCheckoutSessionId,
	metadataId,
}: {
	ctx: RepoContext;
	stripeCheckoutSessionId: string;
	metadataId?: string;
}) => {
	const grantedCustomerProducts =
		await CusProductService.getByStripeCheckoutSessionId({
			db: ctx.db,
			stripeCheckoutSessionId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

	await expireCustomerProducts({
		ctx,
		customerProducts: grantedCustomerProducts.filter(
			(customerProduct) =>
				(customerProduct.subscription_ids ?? []).length === 0,
		),
	});

	if (!metadataId) return;

	await expirePendingCustomerProducts({ ctx, metadataId });
	await MetadataService.delete({ db: ctx.db, id: metadataId });
};
