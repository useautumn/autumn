import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [
		emailOTPClient(),
		organizationClient(),
		adminClient(),
		oauthProviderClient(),
		twoFactorClient(),
		passkeyClient(),
	],
});

export const { useSession, signIn, useListOrganizations } = authClient;
