import {
	CusProductStatus,
	type FullCustomer,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** The replaced subscription's open invoice stays, so its deferred plan must go or paying it would revive these rows. */
export const expireReplacedPendingCustomerProducts = async ({
	ctx,
	fullCustomer,
	replacedStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	replacedStripeSubscriptionId: string;
}) => {
	const pendingCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: replacedStripeSubscriptionId,
	}).filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Pending,
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
