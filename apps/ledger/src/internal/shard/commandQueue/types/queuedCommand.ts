import type {
	Command,
	CommandResult,
} from "../../../../../client/types/command.js";

export type QueuedCommand = {
	command: Command;
	resolve: (result: CommandResult) => void;
};
