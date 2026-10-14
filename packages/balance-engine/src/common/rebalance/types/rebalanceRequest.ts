export type RebalanceRequest = {
	featureId: string;
	customerEntitlementId: string;
	quantity: number;
	creditedCustomerEntitlementId: string | null;
	now: number;
};
