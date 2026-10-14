import type { ApiBalanceV1 } from "@autumn/shared";

export type FundingBalance = Pick<
	ApiBalanceV1,
	"granted" | "usage" | "unlimited"
>;
