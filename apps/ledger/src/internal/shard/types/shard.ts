import type {
	Command,
	CommandResult,
} from "../../../../client/types/command.js";

export type Shard = {
	id: number;
	run: (command: Command) => Promise<CommandResult>;
	stop: () => Promise<void>;
};
