import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [emailOTPClient(), organizationClient(), adminClient()],
});

export const {
	useSession,
	signIn,
	signUp,
	signOut,
	deleteUser,
	useListOrganizations,
} = createAuthClient({
	baseURL: import.meta.env.VITE_BACKEND_URL,
	plugins: [emailOTPClient(), organizationClient(), adminClient()],
});
