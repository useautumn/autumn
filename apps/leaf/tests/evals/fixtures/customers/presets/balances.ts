import { baseBalance } from "../base/baseBalance.js";

export const balances = {
	empty: baseBalance,
	metered: baseBalance,
} as const;
