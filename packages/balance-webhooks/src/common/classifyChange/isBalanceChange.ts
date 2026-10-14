import type { RowChange } from "@autumn/balance-engine";

export const isBalanceChange = (change: RowChange): boolean =>
	change.table !== "locks";
