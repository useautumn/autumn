import type { ScopeString } from "@autumn/shared/scopeDefinitions";
import { Scopes } from "@autumn/shared/scopeDefinitions";

/** Shared defaults for talking to the Autumn API from the MCP server. */
export const DEFAULT_AUTUMN_API_URL = "https://api.useautumn.com";
export const DEFAULT_API_VERSION = "2.3.0";

/** Scopes requested when exchanging an OAuth token for an Autumn API key. */
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
