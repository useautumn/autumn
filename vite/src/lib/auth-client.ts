import { dashClient } from "@better-auth/dash/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import {
	adminClient,
	emailOTPClient,
	organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [
		emailOTPClient(),
		organizationClient(),
		adminClient(),
		dashClient(),
		oauthProviderClient(),
	],
});

export const {
	useSession,
	signIn,
	
	
	
	useListOrganizations,
} = authClient;
