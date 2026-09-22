import type { ConfirmExpiredLockCommand } from "../../commands/confirmExpiredLock/types/confirmExpiredLockCommand.js";
import type { FinalizeCommand } from "../../commands/finalize/types/finalizeCommand.js";
import type { InitializeCommand } from "../../commands/initialize/types/initializeCommand.js";
import type { ResetCommand } from "../../commands/reset/types/resetCommand.js";
import type { TrackCommand } from "../../commands/track/types/trackCommand.js";

/** A command that appends a mutation to the subject's log. */
export type MutatingCommand =
	| TrackCommand
	| InitializeCommand
	| FinalizeCommand
	| ConfirmExpiredLockCommand
	| ResetCommand;
