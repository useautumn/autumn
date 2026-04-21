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
import type { ListPlansParams } from "../../types";
import type { IAutumnClient } from "./IAutumnClient";
import { createHttpClient } from "./internal/httpClient";

/** Configuration for Autumn client */
export type AutumnClientConfig = {
	backendUrl?: string;
	pathPrefix: string;
	includeCredentials?: boolean;
	headers?: Record<string, string>;
};

export const createAutumnClient = (
	config: AutumnClientConfig,
): IAutumnClient => {
	const http = createHttpClient({
		backendUrl: config.backendUrl,
		pathPrefix: config.pathPrefix,
		includeCredentials: config.includeCredentials,
		headers: config.headers,
	});

	return {
		getOrCreateCustomer: (params) =>
			http.request<Customer | null>({
				route: "getOrCreateCustomer",
				body: params,
			}),
		attach: (params) =>
			http.request<AttachResponse>({
				route: "attach",
				body: params,
			}),
		previewAttach: (params) =>
			http.request<PreviewAttachResponse>({
				route: "previewAttach",
				body: params,
			}),
		updateSubscription: (params) =>
			http.request<BillingUpdateResponse>({
				route: "updateSubscription",
				body: params,
			}),
		previewUpdateSubscription: (params) =>
			http.request<PreviewUpdateResponse>({
				route: "previewUpdateSubscription",
				body: params,
			}),
		multiAttach: (params) =>
			http.request<MultiAttachResponse>({
				route: "multiAttach",
				body: params,
			}),
		previewMultiAttach: (params) =>
			http.request<PreviewMultiAttachResponse>({
				route: "previewMultiAttach",
				body: params,
			}),
		setupPayment: (params) =>
			http.request<SetupPaymentResponse>({
				route: "setupPayment",
				body: params,
			}),
		openCustomerPortal: (params) =>
			http.request<OpenCustomerPortalResponse>({
				route: "openCustomerPortal",
				body: params,
			}),
		createReferralCode: (params) =>
			http.request<CreateReferralCodeResponse>({
				route: "createReferralCode",
				body: params,
			}),
		redeemReferralCode: (params) =>
			http.request<RedeemReferralCodeResponse>({
				route: "redeemReferralCode",
				body: params,
			}),
		listPlans: (params?: ListPlansParams) =>
			http.request<ListPlansResponse>({
				route: "listPlans",
				body: params ?? {},
			}),
		listEvents: (params) =>
			http.request<ListEventsResponse>({
				route: "listEvents",
				body: params,
			}),
		aggregateEvents: (params) =>
			http.request<AggregateEventsResponse>({
				route: "aggregateEvents",
				body: params,
			}),
		getEntity: (params) =>
			http.request<GetEntityResponse>({
				route: "getEntity",
				body: params,
			}),
	};
};
