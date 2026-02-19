// Provider

// Types
export type {
	CheckParams,
	ClientAggregateEventsParams,
	ClientAttachParams,
	ClientCreateReferralCodeParams,
	ClientGetOrCreateCustomerParams,
	ClientListEventsParams,
	ClientOpenCustomerPortalParams,
	ClientRedeemReferralCodeParams,
	ProtectedFields,
} from "../types/params";
// Context
export { useAutumnClient } from "./AutumnContext";
export { AutumnProvider, type AutumnProviderProps } from "./AutumnProvider";
// Client (for advanced usage)
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
// Hooks
export {
	type UseCustomerCheckParams,
	type UseCustomerParams,
	type UseCustomerResult,
	useCustomer,
} from "./hooks/useCustomer";
export { type UseListEventsParams, useListEvents } from "./hooks/useListEvents";
export { type UseListPlansParams, useListPlans } from "./hooks/useListPlans";
export {
	type UseReferralsParams,
	type UseReferralsResult,
	useReferrals,
} from "./hooks/useReferrals";
