import type { TrackResponseV3 } from "@autumn/shared";
import type { Command } from "../../src/api/types/command.js";

export type LedgerClient = {
	track: (command: Command) => Promise<TrackResponseV3>;
};

export type LedgerClientContext = {
	baseUrl: string;
	timeoutMs: number;
};
