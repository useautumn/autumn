import type { ApiBalanceV1 } from "@autumn/shared";

/** The funding feature's balance as the track left it, at the tracked identity. */
export type FundingBalance = Pick<
	ApiBalanceV1,
	"granted" | "usage" | "unlimited"
>;
