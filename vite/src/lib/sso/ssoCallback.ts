/** Route the OIDC test sign-in is expected to land on after the callback. */
export const SSO_CALLBACK_PATH = "/sso/callback";

const PENDING_PROVIDER_KEY = "autumn_sso_pending_provider_id";

export const buildSsoCallbackUrl = (origin: string) =>
	`${origin}${SSO_CALLBACK_PATH}`;

/**
 * Provider-hosted authorize URLs are opened with a top-level navigation, so
 * guard against anything that isn't a plain http(s) URL.
 */
export const isSafeSsoRedirectUrl = (url: string | null | undefined) => {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
};

/**
 * The completion route reads `providerId` from the callback query. The
 * remembered value is only a fallback for callbacks that land without it.
 */
export const resolveCallbackProviderId = ({
	queryProviderId,
	rememberedProviderId,
}: {
	queryProviderId: string | null;
	rememberedProviderId: string | null;
}) => queryProviderId?.trim() || rememberedProviderId?.trim() || null;

export const rememberPendingSsoProviderId = (providerId: string) => {
	try {
		sessionStorage.setItem(PENDING_PROVIDER_KEY, providerId);
	} catch {}
};

export const getPendingSsoProviderId = (): string | null => {
	try {
		return sessionStorage.getItem(PENDING_PROVIDER_KEY);
	} catch {
		return null;
	}
};

export const clearPendingSsoProviderId = () => {
	try {
		sessionStorage.removeItem(PENDING_PROVIDER_KEY);
	} catch {}
};
