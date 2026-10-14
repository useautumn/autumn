import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

/** Explicit targets win over the plan, in the same order billing.update resolves them. */
const matchesTarget = ({
	customerProduct,
	productId,
	customerProductId,
	subscriptionId,
}: {
	customerProduct: FullCusProduct;
	productId?: string;
	customerProductId?: string;
	subscriptionId?: string;
}) => {
	if (customerProductId) return customerProduct.id === customerProductId;
	if (subscriptionId) {
		return (
			customerProduct.external_id === subscriptionId ||
			customerProduct.id === subscriptionId
		);
	}
	return !productId || customerProduct.product.id === productId;
};

export const findPendingCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	entityId,
	customerProductId,
	subscriptionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId?: string;
	entityId?: string;
	customerProductId?: string;
	subscriptionId?: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Pending],
		withEntities: false,
		entityId,
	});

	return fullCustomer.customer_products.find((customerProduct) => {
		const entityMatches = entityId
			? customerProduct.entity_id === entityId
			: !customerProduct.internal_entity_id;

		return (
			entityMatches &&
			matchesTarget({
				customerProduct,
				productId,
				customerProductId,
				subscriptionId,
			})
		);
	});
};

/** A request naming a pending plan edits that plan, even when invoice_mode is its only change. */
export const targetsPendingPlan = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer_id: string;
		entity_id?: string;
		customer_product_id?: string;
	};
}) =>
	Boolean(
		params.customer_product_id &&
			(await findPendingCustomerProduct({
				ctx,
				customerId: params.customer_id,
				entityId: params.entity_id,
				customerProductId: params.customer_product_id,
			})),
	);
