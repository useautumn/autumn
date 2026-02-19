import type {
	AggregateEventsResponse,
	BillingAttachResponse,
	CreateReferralCodeResponse,
	Customer,
	ListEventsResponse,
	ListPlansResponse,
	OpenCustomerPortalResponse,
	RedeemReferralCodeResponse,
} from "@useautumn/sdk";
import type {
	AggregateEventsParams,
	AttachParams,
	CreateReferralCodeParams,
	GetOrCreateCustomerClientParams,
	ListEventsParams,
	OpenCustomerPortalParams,
	RedeemReferralCodeParams,
} from "../../types";

/** Client interface matching backend RPC routes */
export interface IAutumnClient {
	getOrCreateCustomer: (
		params?: GetOrCreateCustomerClientParams,
	) => Promise<Customer | null>;
	attach: (params: AttachParams) => Promise<BillingAttachResponse>;
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
