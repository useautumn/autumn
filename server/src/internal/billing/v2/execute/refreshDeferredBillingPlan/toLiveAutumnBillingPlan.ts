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

/** Saved schedule phases name the rows their updates now target. */
const toLiveSchedulePhases = ({
	schedulePhases,
	updatePairs,
}: {
	schedulePhases: AutumnBillingPlan["schedulePhases"];
	updatePairs: [CustomerProductUpdate, CustomerProductUpdate | undefined][];
}) => {
	const liveIdById = new Map(
		updatePairs.flatMap(([update, liveUpdate]) =>
			liveUpdate
				? [[update.customerProduct.id, liveUpdate.customerProduct.id] as const]
				: [],
		),
	);
	return schedulePhases?.map((phase) => ({
		...phase,
		customerProductIds: [
			...new Set(
				phase.customerProductIds.map((id) => liveIdById.get(id) ?? id),
			),
		],
	}));
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
	const toLivePair = (
		update: CustomerProductUpdate,
	): [CustomerProductUpdate, CustomerProductUpdate | undefined] => [
		update,
		toLiveCustomerProductUpdate({
			update,
			fullCustomer,
			insertCustomerProducts,
		}),
	];
	const singleUpdatePair = updateCustomerProduct
		? toLivePair(updateCustomerProduct)
		: undefined;
	const updatePairs = updateCustomerProducts?.map(toLivePair);

	return {
		...autumnBillingPlan,
		updateCustomerProduct: singleUpdatePair?.[1],
		updateCustomerProducts: updatePairs?.flatMap(
			([, liveUpdate]) => liveUpdate ?? [],
		),
		schedulePhases: toLiveSchedulePhases({
			schedulePhases: autumnBillingPlan.schedulePhases,
			updatePairs: [
				...(singleUpdatePair ? [singleUpdatePair] : []),
				...(updatePairs ?? []),
			],
		}),
	};
};
