import { isSafeSsoRedirectUrl } from "@/lib/sso/ssoCallback";
import type { SsoResolveResponse } from "@/lib/sso/ssoTypes";

export const parseSsoResolveResponse = (
	data: unknown,
): SsoResolveResponse | null => {
	if (!data || typeof data !== "object") return null;
	const { action, url } = data as { action?: unknown; url?: unknown };
	if (action === "otp") return { action: "otp" };
	if (action !== "sso") return null;
	if (typeof url !== "string" || !isSafeSsoRedirectUrl(url)) return null;
	return { action: "sso", url };
};

/**
 * Public, signed-out lookup. The backend decides whether a domain or remembered
 * provider is SSO-only, so the dashboard never picks the method itself.
 */
export const resolveSso = async (
	params: { email: string } | { providerId: string },
): Promise<SsoResolveResponse> => {
	const response = await fetch(
		`${import.meta.env.VITE_BACKEND_URL}/auth/sso/resolve`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(params),
		},
	);

	if (!response.ok) {
		throw new Error(`sso_resolve_failed_${response.status}`);
	}

	const parsed = parseSsoResolveResponse(await response.json());
	if (!parsed) {
		throw new Error("sso_resolve_invalid_response");
	}
	return parsed;
};
