import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

// account_mismatch is surfaced as a persistent banner (not a toast) so the user
// can read the two account ids; only transient failures toast here.
const ERROR_TOASTS: Record<string, () => string> = {
	account_mismatch_check_failed: () =>
		"Couldn't verify the OAuth account matches your secret key. Please try again.",
};

type OAuthParams = {
	error: string | null;
	account_id: string | null;
	account_name: string | null;
	secret_key_account_id: string | null;
	connected_org_name: string | null;
	connected_org_slug: string | null;
	success: string | null;
};

const CLEARED: OAuthParams = {
	error: null,
	account_id: null,
	account_name: null,
	secret_key_account_id: null,
	connected_org_name: null,
	connected_org_slug: null,
	success: null,
};

/**
 * Owns the query params Stripe's OAuth callback redirects back with. Toast-style
 * errors are consumed exactly once here (ref-guarded against re-render/strict-mode
 * double-fire); `account_already_connected` is left for the view to render a dialog.
 */
export const useStripeOAuthParams = () => {
	const [params, setParams] = useQueryStates({
		error: parseAsString,
		account_id: parseAsString,
		account_name: parseAsString,
		secret_key_account_id: parseAsString,
		connected_org_name: parseAsString,
		connected_org_slug: parseAsString,
		success: parseAsString,
	});

	const clear = () => setParams(CLEARED);

	const consumedError = useRef<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: clear is a stable wrapper; only params.error should re-trigger.
	useEffect(() => {
		const toastFor = params.error && ERROR_TOASTS[params.error];
		if (!toastFor || consumedError.current === params.error) return;

		consumedError.current = params.error;
		toast.error(toastFor());
		clear();
	}, [params.error]);

	return { params, clear };
};
