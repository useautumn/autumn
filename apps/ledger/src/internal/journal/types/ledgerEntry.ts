import type { AppEnv } from "@autumn/shared";

export type LedgerEntry = {
	shard_id: number;
	customer_id: string;
	org_id: string;
	env: AppEnv;
	version: number;
	command_id: string;
	at: number;
};
