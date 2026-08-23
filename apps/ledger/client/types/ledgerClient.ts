import type { Command, CommandResult } from "./command.js";

export type LedgerClient = {
	track: (command: Command) => Promise<CommandResult>;
};

export type LedgerClientContext = {
	baseUrl: string;
	timeoutMs: number;
};
