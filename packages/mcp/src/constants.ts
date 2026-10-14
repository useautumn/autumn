import type { ScopeString } from "@autumn/shared/scopeDefinitions";
import { Scopes } from "@autumn/shared/scopeDefinitions";

export const DEFAULT_AUTUMN_API_URL = "https://api.useautumn.com";
export const DEFAULT_API_VERSION = "2.3.0";

export const MCP_OAUTH_SCOPES = [
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
	Scopes.Balances.Write,
	Scopes.Analytics.Read,
] as const satisfies readonly ScopeString[];
