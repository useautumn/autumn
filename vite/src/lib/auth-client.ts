import { ac, roles } from "@autumn/shared";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { resolveAuthBaseUrl } from "./authBaseUrl";

export const authClient = createAuthClient({
	baseURL: resolveAuthBaseUrl({
		backendUrl: import.meta.env.VITE_BACKEND_URL,
		origin: typeof window === "undefined" ? undefined : window.location.origin,
	}),
	plugins: [
		emailOTPClient(),
		organizationClient({ ac, roles }),
		adminClient(),
		oauthProviderClient(),
		passkeyClient(),
	],
});

export const { useSession, signIn, useListOrganizations } = authClient;
