import type { ImpersonationTokens } from "./impersonationTokens";

export type OAuthTokens = {
	accessToken: string;
	tokenType: "Bearer";
	expiresInSeconds?: number;
	refreshToken?: string;
};

/** What the loopback callback delivered: a grant to exchange, or ready-made tokens. */
export type AuthorizationOutcome =
	| { kind: "oauth"; tokens: OAuthTokens }
	| { kind: "impersonation"; tokens: ImpersonationTokens };
