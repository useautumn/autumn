import {
	type AutumnBillingPlan,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	findActiveCustomerProductById,
	findMainActiveCustomerProductByGroup,
} from "@autumn/shared";

export const isCustomerProductLive = ({
	customerProduct,
	fullCustomer,
}: {
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}) =>
	fullCustomer.customer_products.some(
		(liveCustomerProduct) => liveCustomerProduct.id === customerProduct.id,
	);

/** Only a plan this billing plan replaces with a new main plan in its group may move to a successor. */
const isReplacedByIncomingPlan = ({
	customerProduct,
	insertCustomerProducts,
}: {
	customerProduct: FullCusProduct;
	insertCustomerProducts: FullCusProduct[];
}) =>
	!customerProduct.product.is_add_on &&
	insertCustomerProducts.some(
		(incoming) =>
			!incoming.product.is_add_on &&
			incoming.product.group === customerProduct.product.group,
	);

/** The row now holding a replaced plan's place: the same product, else a replaced plan's group successor. */
const findReplacementCustomerProduct = ({
	customerProduct,
	fullCustomer,
	insertCustomerProducts,
}: {
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	insertCustomerProducts: FullCusProduct[];
}) => {
	const internalEntityId = customerProduct.internal_entity_id ?? undefined;

	const sameProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: customerProduct.product.id,
		internalEntityId,
	});
	if (
		sameProduct ||
		!isReplacedByIncomingPlan({ customerProduct, insertCustomerProducts })
	) {
		return sameProduct;
	}

	return findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId,
	});
};

/** A plan replaced since the invoice was created is expired through its current row instead. */
export const toLiveCustomerProductUpdate = ({
	update,
	fullCustomer,
	insertCustomerProducts,
}: {
	update: CustomerProductUpdate;
	fullCustomer: FullCustomer;
	insertCustomerProducts: FullCusProduct[];
}): CustomerProductUpdate | undefined => {
	const { customerProduct } = update;
	if (isCustomerProductLive({ customerProduct, fullCustomer })) return update;

	const liveCustomerProduct = findReplacementCustomerProduct({
		customerProduct,
		fullCustomer,
		insertCustomerProducts,
	});
	if (!liveCustomerProduct) return undefined;

	return { ...update, customerProduct: liveCustomerProduct };
};

export const toLiveAutumnBillingPlan = ({
	autumnBillingPlan,
	fullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	fullCustomer: FullCustomer;
}): AutumnBillingPlan => {
	const {
		updateCustomerProduct,
		updateCustomerProducts,
		insertCustomerProducts,
	} = autumnBillingPlan;
	const toLive = (update: CustomerProductUpdate) =>
		toLiveCustomerProductUpdate({
			update,
			fullCustomer,
			insertCustomerProducts,
		});

	return {
		...autumnBillingPlan,
		updateCustomerProduct:
			updateCustomerProduct && toLive(updateCustomerProduct),
		updateCustomerProducts: updateCustomerProducts?.flatMap(
			(update) => toLive(update) ?? [],
		),
	};
};
