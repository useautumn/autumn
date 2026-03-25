import type {
	AggregateEventsResponse,
	AttachResponse,
	BillingUpdateResponse,
	CreateReferralCodeResponse,
	Customer,
	GetEntityResponse,
	ListEventsResponse,
	ListPlansResponse,
	MultiAttachResponse,
	OpenCustomerPortalResponse,
	PreviewAttachResponse,
	PreviewMultiAttachResponse,
	PreviewUpdateResponse,
	RedeemReferralCodeResponse,
	SetupPaymentResponse,
} from "@useautumn/sdk";
import type {
	AggregateEventsParams,
	AttachParams,
	CreateReferralCodeParams,
	GetEntityClientParams,
	GetOrCreateCustomerClientParams,
	ListEventsParams,
	ListPlansParams,
	MultiAttachParams,
	OpenCustomerPortalParams,
	PreviewAttachParams,
	PreviewMultiAttachParams,
	PreviewUpdateSubscriptionParams,
	RedeemReferralCodeParams,
	SetupPaymentParams,
	UpdateSubscriptionParams,
} from "../../types";

/** Client interface matching backend RPC routes */
export interface IAutumnClient {
	getOrCreateCustomer: (
		params?: GetOrCreateCustomerClientParams,
	) => Promise<Customer | null>;
	attach: (params: AttachParams) => Promise<AttachResponse>;
	previewAttach: (
		params: PreviewAttachParams,
	) => Promise<PreviewAttachResponse>;
	updateSubscription: (
		params: UpdateSubscriptionParams,
	) => Promise<BillingUpdateResponse>;
	previewUpdateSubscription: (
		params: PreviewUpdateSubscriptionParams,
	) => Promise<PreviewUpdateResponse>;
	multiAttach: (params: MultiAttachParams) => Promise<MultiAttachResponse>;
	previewMultiAttach: (
		params: PreviewMultiAttachParams,
	) => Promise<PreviewMultiAttachResponse>;
	setupPayment: (params: SetupPaymentParams) => Promise<SetupPaymentResponse>;
	openCustomerPortal: (
		params: OpenCustomerPortalParams,
	) => Promise<OpenCustomerPortalResponse>;
	createReferralCode: (
		params: CreateReferralCodeParams,
	) => Promise<CreateReferralCodeResponse>;
	redeemReferralCode: (
		params: RedeemReferralCodeParams,
	) => Promise<RedeemReferralCodeResponse>;
	listPlans: (params?: ListPlansParams) => Promise<ListPlansResponse>;
	listEvents: (params: ListEventsParams) => Promise<ListEventsResponse>;
	aggregateEvents: (
		params: AggregateEventsParams,
	) => Promise<AggregateEventsResponse>;
	getEntity: (params: GetEntityClientParams) => Promise<GetEntityResponse>;
}
