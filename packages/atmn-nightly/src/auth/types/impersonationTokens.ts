/** One-hour OAuth tokens handed back when the dashboard session impersonates a customer. */
export type ImpersonationTokens = {
	sandboxToken: string;
	liveToken: string;
	/** ISO 8601. */
	expiresAt: string;
};

export const IMPERSONATION_CALLBACK_PARAMS = {
	sandboxToken: "impersonation_sandbox_token",
	liveToken: "impersonation_live_token",
	expiresAt: "impersonation_expires_at",
} as const;

export const readImpersonationTokens = (
	params: URLSearchParams,
): ImpersonationTokens | null => {
	const sandboxToken = params.get(IMPERSONATION_CALLBACK_PARAMS.sandboxToken);
	const liveToken = params.get(IMPERSONATION_CALLBACK_PARAMS.liveToken);
	const expiresAt = params.get(IMPERSONATION_CALLBACK_PARAMS.expiresAt);
	if (!sandboxToken || !liveToken || !expiresAt) return null;
	return { sandboxToken, liveToken, expiresAt };
};
