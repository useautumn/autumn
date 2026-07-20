export type CustomerProductTransition = {
	fromInternalProductId: string;
	toInternalProductId: string;
};

export const computeCustomerProductTransition = ({
	fromInternalProductId,
	toInternalProductId,
}: CustomerProductTransition): CustomerProductTransition | undefined =>
	fromInternalProductId === toInternalProductId
		? undefined
		: { fromInternalProductId, toInternalProductId };
