const AUTUMN_SECRET_KEY_PREFIX = "am_sk";
const AUTUMN_PUBLISHABLE_KEY_PREFIX = "am_pk";
const AUTUMN_OAUTH_TOKEN_PREFIX = "am_oauth_";
const AUTUMN_CUSTOMER_JWT_PREFIX = "am_jwt_";

export const isSecretKeyPrefix = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_SECRET_KEY_PREFIX);

export const isPublishableKeyPrefix = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_PUBLISHABLE_KEY_PREFIX);

export const isAutumnApiKey = ({ token }: { token: string }) =>
	isSecretKeyPrefix({ token }) || isPublishableKeyPrefix({ token });

export const isOAuthToken = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_OAUTH_TOKEN_PREFIX);

export const prefixOAuthToken = ({ token }: { token: string }) =>
	isOAuthToken({ token }) ? token : `${AUTUMN_OAUTH_TOKEN_PREFIX}${token}`;

export const stripOAuthTokenPrefix = ({ token }: { token: string }) =>
	isOAuthToken({ token })
		? token.slice(AUTUMN_OAUTH_TOKEN_PREFIX.length)
		: token;

export const isCustomerJwt = ({ token }: { token: string }) =>
	token.startsWith(AUTUMN_CUSTOMER_JWT_PREFIX);

export const prefixCustomerJwt = ({ token }: { token: string }) =>
	isCustomerJwt({ token }) ? token : `${AUTUMN_CUSTOMER_JWT_PREFIX}${token}`;

export const stripCustomerJwtPrefix = ({ token }: { token: string }) =>
	isCustomerJwt({ token })
		? token.slice(AUTUMN_CUSTOMER_JWT_PREFIX.length)
		: token;
