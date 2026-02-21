import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { useMockSession } from "./mockSession";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [
		emailOTPClient(),
		organizationClient(),
		adminClient(),
		oauthProviderClient(),
	],
});

const isMockMode = import.meta.env.VITE_MOCK_MODE === "true";

/**
 * useSession — returns the mock session when VITE_MOCK_MODE=true,
 * otherwise delegates to better-auth.
 */
export const useSession = isMockMode ? useMockSession : authClient.useSession;

export const { signIn, useListOrganizations } = authClient;
