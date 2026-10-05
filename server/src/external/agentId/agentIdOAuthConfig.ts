import type { GenericOAuthConfig } from "better-auth/plugins";

export const AGENT_ID_PROVIDER_ID = "agentid";

// Mirrors @agentmail/agentid-better-auth, which needs better-auth >= 1.7.2.
export const getAgentIdOAuthConfigs = (): GenericOAuthConfig[] => {
	const clientId = process.env.AGENTID_CLIENT_ID;
	const clientSecret = process.env.AGENTID_CLIENT_SECRET;
	if (!clientId || !clientSecret) return [];

	return [
		{
			providerId: AGENT_ID_PROVIDER_ID,
			discoveryUrl: "https://auth.agentid.com/.well-known/openid-configuration",
			clientId,
			clientSecret,
			scopes: ["openid", "email", "profile"],
			pkce: true,
			// Agents without a display name fail Better Auth's required-name check.
			mapProfileToUser: (profile) => ({
				name: profile.name || String(profile.email ?? "").split("@")[0],
			}),
		},
	];
};
