import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Its open invoice stays (Q8), so the deferred plan must go or paying it would revive these rows. */
export const expireReplacedPendingCustomerProducts = async ({
	ctx,
	fullCustomer,
	replacedStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	replacedStripeSubscriptionId: string;
}) => {
	const pendingCustomerProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Pending &&
			customerProduct.subscription_ids?.includes(replacedStripeSubscriptionId),
	);

	for (const customerProduct of pendingCustomerProducts) {
		await CusProductService.expireIfPending({
			ctx,
			cusProductId: customerProduct.id,
		});
		if (customerProduct.metadata_id) {
			await MetadataService.delete({
				db: ctx.db,
				id: customerProduct.metadata_id,
			});
		}
	}
};
