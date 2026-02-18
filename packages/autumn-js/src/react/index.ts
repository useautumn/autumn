// Provider

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
// Types
export type {
	CheckParams,
	ClientAttachParams,
	ClientGetOrCreateCustomerParams,
	ProtectedFields,
} from "../types/params";
