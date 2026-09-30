/** Who a list page reads from: one customer (optionally one of its entities), or the whole org. */
export type ListScope = {
	internalCustomerId: string | null;
	internalEntityId: string | null;
};
