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
 * better-auth's SSO error redirects append `?error=...` with a hardcoded `?`,
 * so a callback URL that already carries `?providerId=` arrives with two of
 * them and swallows the error into the providerId value.
 */
export const parseSsoCallbackQuery = (search: string) =>
	new URLSearchParams(
		search.replace(/\?/g, (match, offset: number) =>
			offset === 0 ? match : "&",
		),
	);

/**
 * better-auth reports provider-side failures as opaque codes. Bad client
 * credentials arrive as `token_response_not_found` because its BetterFetchError
 * check misses, so the provider's own 401 never reaches us.
 */
const SSO_CALLBACK_ERROR_CODE_MESSAGES: Record<string, string> = {
	"account not linked":
		"You already have an Autumn account with this email, but its address isn't verified yet, so we can't connect it to your provider. Verify your email, then sign in again.",
};

const SSO_CALLBACK_ERROR_MESSAGES: Record<string, string> = {
	token_response_not_found:
		"Your identity provider rejected Autumn's credentials. Check that the client ID and client secret match the OIDC app exactly.",
	token_endpoint_not_found:
		"Your provider's OIDC discovery document is missing a token endpoint. Check the issuer URL.",
	jwks_endpoint_not_found:
		"Your provider's OIDC discovery document is missing a JWKS endpoint. Check the issuer URL.",
	token_not_verified:
		"Autumn couldn't verify the token your provider returned. Check that the issuer URL matches the one that signs your tokens.",
	missing_user_info:
		"Your provider didn't return an email for this user. Check that the OIDC app requests the email and profile scopes.",
	user_info_endpoint_not_found:
		"Your provider's OIDC discovery document is missing a userinfo endpoint. Check the issuer URL.",
};

export const describeSsoCallbackError = ({
	error,
	description,
}: {
	error: string;
	description: string | null;
}) =>
	SSO_CALLBACK_ERROR_CODE_MESSAGES[error] ??
	(description ? SSO_CALLBACK_ERROR_MESSAGES[description] : undefined) ??
	description ??
	`Your identity provider rejected the sign-in (${error}).`;

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
