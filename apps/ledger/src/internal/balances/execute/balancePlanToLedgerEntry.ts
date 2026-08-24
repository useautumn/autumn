import type { Command } from "../../../api/types/command.js";
import type { LedgerEntry } from "../../journal/types/ledgerEntry.js";
import type { BalancePlan } from "../types/balancePlan.js";

export const balancePlanToLedgerEntry = ({
	command,
	plan,
	shardId,
	version,
}: {
	command: Command;
	plan: BalancePlan;
	shardId: number;
	version: number;
}): LedgerEntry => ({
	shard_id: shardId,
	org_id: command.org_id,
	env: command.env,
	customer_id: command.customer_id,
	version,
	command_id: command.id,
	at: command.at,
	mutations: plan.mutations,
	after: plan.after,
	remaining: plan.remaining,
});
