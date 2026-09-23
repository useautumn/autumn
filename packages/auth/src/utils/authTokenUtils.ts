const AUTUMN_SECRET_KEY_PREFIX = "am_sk";
const AUTUMN_PUBLISHABLE_KEY_PREFIX = "am_pk";
const AUTUMN_OAUTH_TOKEN_PREFIX = "am_oauth_";
const OAUTH_TOKEN_PREFIXES = [
	"am_sk_test_oauth_",
	"am_sk_live_oauth_",
	AUTUMN_OAUTH_TOKEN_PREFIX,
];
const AUTUMN_CUSTOMER_JWT_PREFIX = "am_jwt_";

export const isSecretKeyPrefix = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_SECRET_KEY_PREFIX);

export const isPublishableKeyPrefix = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_PUBLISHABLE_KEY_PREFIX);

export const isAutumnApiKey = ({ token }: { token: string }) =>
	isSecretKeyPrefix({ token }) || isPublishableKeyPrefix({ token });

export const isOAuthToken = ({ token }: { token: string }) =>
	OAUTH_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));

export const prefixOAuthToken = ({
	token,
	env,
}: {
	token: string;
	env?: "sandbox" | "live" | null;
}) => {
	const prefix = env
		? `am_sk_${env === "sandbox" ? "test" : "live"}_oauth_`
		: AUTUMN_OAUTH_TOKEN_PREFIX;
	return `${prefix}${stripOAuthTokenPrefix({ token })}`;
};

export const stripOAuthTokenPrefix = ({ token }: { token: string }) => {
	const prefix = OAUTH_TOKEN_PREFIXES.find((prefix) =>
		token.startsWith(prefix),
	);
	return prefix ? token.slice(prefix.length) : token;
};

export const isCustomerJwt = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_CUSTOMER_JWT_PREFIX);

export const prefixCustomerJwt = ({ token }: { token: string }) =>
	isCustomerJwt({ token }) ? token : `${AUTUMN_CUSTOMER_JWT_PREFIX}${token}`;

export const stripCustomerJwtPrefix = ({ token }: { token: string }) =>
	isCustomerJwt({ token })
		? token.slice(AUTUMN_CUSTOMER_JWT_PREFIX.length)
		: token;
