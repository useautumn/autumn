import type { Command } from "../../../api/types/command.js";
import type { CommandResult } from "../../../api/types/commandResult.js";

export type Shard = {
	id: number;
	run: (command: Command) => Promise<CommandResult>;
	stop: () => Promise<void>;
};
