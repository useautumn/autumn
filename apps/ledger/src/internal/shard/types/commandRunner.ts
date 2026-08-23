import type { Command } from "../../../../client/types/command.js";
import type { CommandOutcome } from "./commandOutcome.js";
import type { ShardContext } from "./shardContext.js";

export type CommandRunner = (params: {
	ctx: ShardContext;
	command: Command;
}) => CommandOutcome;
