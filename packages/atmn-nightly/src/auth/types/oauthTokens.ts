export type OAuthTokens = {
	accessToken: string;
	tokenType: "Bearer";
	expiresInSeconds?: number;
	refreshToken?: string;
};
