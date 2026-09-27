import type { RowChange } from "@autumn/balance-engine";

/** A lock holds no balance: a lock change moves nothing a webhook or a top-up could read. */
export const isBalanceChange = (change: RowChange): boolean =>
	change.table !== "locks";
