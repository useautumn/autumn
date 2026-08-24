import type { AppEnv } from "@autumn/shared";
import type { BalancePlan } from "../../balances/types/balancePlan.js";

// The subject reference, the command that produced it, and the plan verbatim.
export type LedgerEntry = {
	shard_id: number;
	customer_id: string;
	org_id: string;
	env: AppEnv;
	version: number;
	command_id: string;
	at: number;
} & BalancePlan;
