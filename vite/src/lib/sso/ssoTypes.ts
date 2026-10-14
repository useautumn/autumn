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
	setup: SsoSetup;
}

export interface CreateSsoConnectionParams {
	domain: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
}

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
