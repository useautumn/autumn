export const BalancesErrorCode = {
	InsufficientBalance: "insufficient_balance",
} as const;

export type BalancesErrorCode =
	(typeof BalancesErrorCode)[keyof typeof BalancesErrorCode];
