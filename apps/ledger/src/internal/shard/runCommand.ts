import { LedgerNotImplementedError } from "../../lib/ledgerNotImplementedError.js";
import { track } from "../balances/actions/track/track.js";
import type { CommandRunner } from "./types/commandRunner.js";

export const runCommand: CommandRunner = ({ ctx, command }) => {
	if (command.kind === "track") return track({ ctx, command });
	throw new LedgerNotImplementedError("command kind");
};
