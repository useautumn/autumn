import type { Feature } from "@autumn/shared";
import type { Command } from "../../../api/types/command.js";
import type { Subject } from "../../subjects/types/subject.js";

// What every balances action starts from: the command, the subject state it may
// touch, and the features that decided which rows those are.
export type BalanceContext = {
	command: Command;
	subject: Subject;
	features: Feature[];
};
