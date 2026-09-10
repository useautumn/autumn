import { isScopeSubset, Scopes } from "@autumn/shared";

export const AGENT_PROVISIONING_KEY_SOURCE = "agent_provisioning";

export const AGENT_PROVISIONAL_API_KEY_SCOPES = [
	Scopes.Organisation.Read,
	Scopes.Organisation.Write,
	Scopes.Features.Read,
	Scopes.Features.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
] as const;

export const AGENT_USER_API_KEY_SCOPES = [
	Scopes.Organisation.Read,
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Features.Read,
	Scopes.Features.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Rewards.Read,
	Scopes.Rewards.Write,
	Scopes.ApiKeys.Read,
	Scopes.ApiKeys.Write,
] as const;

export const grantAgentUserApiKeyScopes = ({
	userScopes,
}: {
	userScopes: readonly string[];
}): string[] =>
	AGENT_USER_API_KEY_SCOPES.filter((scope) =>
		isScopeSubset([scope], userScopes),
	);
