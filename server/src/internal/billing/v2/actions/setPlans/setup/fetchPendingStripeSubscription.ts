import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const isPendingOnSubscription = ({
	customerProduct,
	internalEntityId,
}: {
	customerProduct: FullCusProduct;
	internalEntityId?: string;
}) =>
	customerProduct.status === CusProductStatus.Pending &&
	(customerProduct.internal_entity_id ?? undefined) === internalEntityId &&
	(customerProduct.subscription_ids?.length ?? 0) > 0;

/** A failed first payment leaves its plans Pending on an incomplete subscription the target lookup skips. */
export const fetchPendingStripeSubscription = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const pendingCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) =>
			isPendingOnSubscription({
				customerProduct,
				internalEntityId: fullCustomer.entity?.internal_id,
			}),
	);
	const subscriptionId = pendingCustomerProduct?.subscription_ids?.[0];
	if (!subscriptionId) return undefined;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	return stripeCli.subscriptions.retrieve(subscriptionId, {
		expand: ["discounts.source.coupon.applies_to"],
	});
};
