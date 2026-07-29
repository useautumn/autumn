export type SsoConnectionStatus =
	| "pending_domain_verification"
	| "validating"
	| "active";

export interface SsoDomainVerification {
	host: string;
	value: string;
	expiresAt: string;
}

export interface SsoConnection {
	providerId: string;
	domain: string;
	issuer: string;
	status: SsoConnectionStatus;
	callbackUrl: string;
	clientIdLastFour: string;
	verification: SsoDomainVerification | null;
}

export interface SsoSetup {
	callbackUrl: string;
}

export interface SsoConnectionResponse {
	connection: SsoConnection | null;
	/**
	 * Returned on every authenticated SSO response, including before a
	 * connection exists, so the callback URL can be registered with the identity
	 * provider before its client credentials are issued.
	 */
	setup: SsoSetup;
}

export interface CreateSsoConnectionParams {
	domain: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
}

/** Presentation-only hint persisted after a successful SSO callback. */
export interface SsoOrgHint {
	providerId: string;
	organizationName: string;
	logo: string | null;
}

export interface SsoCompleteResponse {
	hint: SsoOrgHint;
	activated: boolean;
}

export type SsoResolveResponse =
	| { action: "sso"; url: string }
	| { action: "otp" };
