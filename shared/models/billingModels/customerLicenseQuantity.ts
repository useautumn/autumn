/** Requested total seats for one license plan, inclusive of the link's
 * included amount — init derives paid_quantity by subtracting it. */
export type CustomerLicenseQuantity = {
	licensePlanId: string;
	totalQuantity: number;
};
