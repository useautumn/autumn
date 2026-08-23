import { trackCommand } from "./trackCommand.js";
import type { Command } from "./types/command.js";
import type {
	LedgerClient,
	LedgerClientContext,
} from "./types/ledgerClient.js";

const DEFAULT_TIMEOUT_MS = 1000;

export const createLedgerClient = ({
	baseUrl,
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
	baseUrl: string;
	timeoutMs?: number;
}): LedgerClient => {
	const ctx: LedgerClientContext = { baseUrl, timeoutMs };

	return { track: (command: Command) => trackCommand({ ctx, command }) };
};
