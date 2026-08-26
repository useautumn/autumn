/** Display fields resolved for a `customer_id` group in an events aggregate. */
export type CustomerDisplayInfo = {
	name: string | null;
	email: string | null;
};

/** Display fields resolved for an `entity_id` group, plus the customer owning it. */
export type EntityDisplayInfo = {
	name: string | null;
	internal_customer_id: string;
};
