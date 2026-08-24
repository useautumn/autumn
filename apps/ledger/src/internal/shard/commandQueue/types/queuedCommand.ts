import type { Command } from "../../../../api/types/command.js";
import type { CommandResult } from "../../../../api/types/commandResult.js";

export type QueuedCommand = {
	command: Command;
	resolve: (result: CommandResult) => void;
};
