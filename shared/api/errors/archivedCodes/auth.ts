/**
 * Authentication and authorization error codes
 */
export const AuthErrorCode = {
	// API Version
	InvalidApiVersion: "invalid_api_version",

	// Secret Key Auth
	NoSecretKey: "no_secret_key",
	InvalidSecretKey: "invalid_secret_key",
	FailedToVerifySecretKey: "failed_to_verify_secret_key",
	FailedToFetchKeyFromAutumn: "failed_to_fetch_key_from_autumn",

	// Publishable Key Auth
	NoPublishableKey: "no_publishable_key",
	InvalidPublishableKey: "invalid_publishable_key",
	GetOrgFromPublishableKeyFailed: "get_org_from_publishable_key_failed",
	EndpointNotPublic: "endpoint_not_public",
	FailedToVerifyPublishableKey: "failed_to_verify_publishable_key",

	// General Auth
	NoAuthHeader: "no_auth_header",
	InvalidAuthHeader: "invalid_auth_header",
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
