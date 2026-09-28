import {
	OPENID_SCOPES,
	type ResourceType,
	type ScopeString,
	Scopes,
} from "../scopeDefinitions";

export const DEFAULT_OAUTH_RESOURCE_SCOPES = [
	Scopes.Organisation.Read,
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Features.Read,
	Scopes.Features.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Rewards.Read,
	Scopes.Rewards.Write,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
	Scopes.Analytics.Read,
] as const satisfies readonly ScopeString[];

/** Scopes atmn-minted keys need when used as an app's AUTUMN_SECRET_KEY. */
export const ATMN_APP_KEY_SCOPES = [
	Scopes.Analytics.Read,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
] as const satisfies readonly ScopeString[];

export const OAUTH_PROTOCOL_SCOPES = OPENID_SCOPES;

export const DEFAULT_OAUTH_RESOURCES = [
	...new Set(DEFAULT_OAUTH_RESOURCE_SCOPES.map((scope) => scope.split(":")[0])),
] as ResourceType[];
