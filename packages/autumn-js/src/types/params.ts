import type {
	BalancesCheckRequest,
	BillingAttachRequest,
	CreateReferralCodeParams,
	CustomerExpand,
	EventsAggregateParams,
	EventsListParams,
	OpenCustomerPortalParams,
	RedeemReferralCodeParams,
} from "@useautumn/sdk";

/** Fields injected by backend - stripped from frontend params */
export type ProtectedFields = "customerId" | "customerData";

/** GetOrCreateCustomer params without protected fields (for frontend use) */
export type ClientGetOrCreateCustomerParams = {
	errorOnNotFound?: boolean;
	expand?: CustomerExpand[];
};

/** Check params for local balance check */
export type ClientCheckParams = Omit<BalancesCheckRequest, ProtectedFields>;

/** Attach params without protected fields (for frontend use) */
export type ClientAttachParams = Omit<
	BillingAttachRequest,
	ProtectedFields | "sendEvent" | "properties" | "withPreview"
> & {
	openInNewTab?: boolean;
};

/** Open customer portal params without protected fields (for frontend use) */
export type ClientOpenCustomerPortalParams = Omit<
	OpenCustomerPortalParams,
	ProtectedFields
> & {
	openInNewTab?: boolean;
};

/** Create referral code params without protected fields (for frontend use) */
export type ClientCreateReferralCodeParams = Omit<
	CreateReferralCodeParams,
	ProtectedFields
>;

/** Redeem referral code params without protected fields (for frontend use) */
export type ClientRedeemReferralCodeParams = Omit<
	RedeemReferralCodeParams,
	ProtectedFields
>;

/** List events params without protected fields (for frontend use) */
export type ClientListEventsParams = Omit<EventsListParams, ProtectedFields>;

/** Aggregate events params without protected fields (for frontend use) */
export type ClientAggregateEventsParams = Omit<
	EventsAggregateParams,
	ProtectedFields
>;
