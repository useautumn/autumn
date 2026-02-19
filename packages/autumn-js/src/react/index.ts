// Provider

// Types
export type {
	CheckParams,
	ClientAttachParams,
	ClientCreateReferralCodeParams,
	ClientGetOrCreateCustomerParams,
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
// Hooks
export {
	type UseCustomerCheckParams,
	type UseCustomerParams,
	type UseCustomerResult,
	useCustomer,
} from "./hooks/useCustomer";
export { type UseListPlansParams, useListPlans } from "./hooks/useListPlans";
