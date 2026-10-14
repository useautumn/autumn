export type {
	ClientAggregateEventsParams,
	ClientAttachParams,
	ClientCreateReferralCodeParams,
	ClientGetEntityParams,
	ClientGetOrCreateCustomerParams,
	ClientListEventsParams,
	ClientMultiAttachParams,
	ClientOpenCustomerPortalParams,
	ClientPreviewAttachParams,
	ClientPreviewMultiAttachParams,
	ClientPreviewUpdateSubscriptionParams,
	ClientRedeemReferralCodeParams,
	ClientSetupPaymentParams,
	ClientUpdateSubscriptionParams,
	ProtectedFields,
} from "../types/params";
export { useAutumnClient } from "./AutumnContext";
export { AutumnProvider, type AutumnProviderProps } from "./AutumnProvider";
export {
	type AutumnClientConfig,
	AutumnClientError,
	createAutumnClient,
	type IAutumnClient,
} from "./client";
export {
	type UseAggregateEventsParams,
	useAggregateEvents,
} from "./hooks/useAggregateEvents";
export {
	type UseCustomerCheckParams,
	type UseCustomerParams,
	type UseCustomerResult,
	useCustomer,
} from "./hooks/useCustomer";
export {
	type UseEntityParams,
	type UseEntityResult,
	useEntity,
} from "./hooks/useEntity";
export { type UseListEventsParams, useListEvents } from "./hooks/useListEvents";
export { type UseListPlansParams, useListPlans } from "./hooks/useListPlans";
export {
	type UseReferralsParams,
	type UseReferralsResult,
	useReferrals,
} from "./hooks/useReferrals";
