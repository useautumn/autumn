export const BalancesErrorCode = {
	InsufficientBalance: "insufficient_balance",
	UsageLimitExceeded: "usage_limit_exceeded",
} as const;

export type BalancesErrorCode =
	(typeof BalancesErrorCode)[keyof typeof BalancesErrorCode];
