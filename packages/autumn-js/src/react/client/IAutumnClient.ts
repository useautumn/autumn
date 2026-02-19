import type {
	AggregateEventsResponse,
	BillingAttachResponse,
	BillingUpdateResponse,
	CreateReferralCodeResponse,
	Customer,
	ListEventsResponse,
	ListPlansResponse,
	OpenCustomerPortalResponse,
	PreviewAttachResponse,
	PreviewUpdateResponse,
	RedeemReferralCodeResponse,
} from "@useautumn/sdk";
import type {
	AggregateEventsParams,
	AttachParams,
	CreateReferralCodeParams,
	GetOrCreateCustomerClientParams,
	ListEventsParams,
	OpenCustomerPortalParams,
	PreviewAttachParams,
	PreviewUpdateSubscriptionParams,
	RedeemReferralCodeParams,
	UpdateSubscriptionParams,
} from "../../types";

/** Client interface matching backend RPC routes */
export interface IAutumnClient {
	getOrCreateCustomer: (
		params?: GetOrCreateCustomerClientParams,
	) => Promise<Customer | null>;
	attach: (params: AttachParams) => Promise<BillingAttachResponse>;
	previewAttach: (
		params: PreviewAttachParams,
	) => Promise<PreviewAttachResponse>;
	updateSubscription: (
		params: UpdateSubscriptionParams,
	) => Promise<BillingUpdateResponse>;
	previewUpdateSubscription: (
		params: PreviewUpdateSubscriptionParams,
	) => Promise<PreviewUpdateResponse>;
	openCustomerPortal: (
		params: OpenCustomerPortalParams,
	) => Promise<OpenCustomerPortalResponse>;
	createReferralCode: (
		params: CreateReferralCodeParams,
	) => Promise<CreateReferralCodeResponse>;
	redeemReferralCode: (
		params: RedeemReferralCodeParams,
	) => Promise<RedeemReferralCodeResponse>;
	listPlans: () => Promise<ListPlansResponse>;
	listEvents: (params: ListEventsParams) => Promise<ListEventsResponse>;
	aggregateEvents: (
		params: AggregateEventsParams,
	) => Promise<AggregateEventsResponse>;
}
