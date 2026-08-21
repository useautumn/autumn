import { ac, roles } from "@autumn/shared";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const authClient = createAuthClient({
	baseURL: backendUrl?.startsWith("/") ? window.location.origin : backendUrl,
	plugins: [
		emailOTPClient(),
		organizationClient({ ac, roles }),
		adminClient(),
		oauthProviderClient(),
		passkeyClient(),
	],
});

export const { useSession, signIn, useListOrganizations } = authClient;
