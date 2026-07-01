import { authClient } from "@/lib/auth-client";

/**
 * Reads the user's current passkey credentials from better-auth and exposes
 * a single boolean. Used to gate org switching to passkey-required orgs.
 *
 * The query is cached by better-auth's nanostore; this hook is cheap to call
 * from multiple components in the same render.
 */
export const useHasPasskey = () => {
	const { data, isPending, error } = authClient.useListPasskeys();
	const passkeys = Array.isArray(data) ? data : [];
	return {
		hasPasskey: passkeys.length > 0,
		isLoading: isPending,
		error,
	};
};
