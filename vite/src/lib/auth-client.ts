import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [
		emailOTPClient(),
		organizationClient(),
		adminClient(),
		oauthProviderClient(),
	],
});

export const {
	useSession,
	signIn,
	signUp,
	signOut,
	deleteUser,
	useListOrganizations,
} = authClient;
