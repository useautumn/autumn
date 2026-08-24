import type { Command } from "../../api/types/command.js";

export const SHARD_COUNT = 256;

export const resolveShardId = ({
	command,
}: {
	command: Pick<Command, "customer_id" | "env" | "org_id">;
}): number =>
	Number(
		BigInt(
			Bun.hash(`${command.org_id}:${command.env}:${command.customer_id}`),
		) % BigInt(SHARD_COUNT),
	);
