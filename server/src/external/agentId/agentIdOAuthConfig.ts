import type { GenericOAuthConfig } from "better-auth/plugins";

export const AGENT_ID_PROVIDER_ID = "agentid";

// Mirrors @agentmail/agentid-better-auth, which needs better-auth >= 1.7.2.
export const getAgentIdOAuthConfigs = (): GenericOAuthConfig[] => {
	const clientId = process.env.AGENTID_CLIENT_ID;
	if (!clientId) return [];

	return [
		{
			providerId: AGENT_ID_PROVIDER_ID,
			discoveryUrl: "https://auth.agentid.com/.well-known/openid-configuration",
			clientId,
			clientSecret: process.env.AGENTID_CLIENT_SECRET,
			scopes: ["openid", "email", "profile"],
			pkce: true,
		},
	];
};
