import { type ScopeString, Scopes } from "./scopeDefinitions";

export const LEAF_OAUTH_SCOPES = [
	Scopes.Organisation.Read,
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Features.Read,
	Scopes.Features.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
	Scopes.Analytics.Read,
] as const satisfies readonly ScopeString[];
