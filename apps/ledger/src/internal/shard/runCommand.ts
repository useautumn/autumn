import { LedgerNotImplementedError } from "../../lib/ledgerNotImplementedError.js";
import { runTrack } from "../balances/actions/track/runTrack.js";
import type { CommandRunner } from "./types/commandRunner.js";

export const runCommand: CommandRunner = ({ ctx, command }) => {
	if (command.kind === "track") return runTrack({ ctx, command });
	throw new LedgerNotImplementedError("command kind");
};
