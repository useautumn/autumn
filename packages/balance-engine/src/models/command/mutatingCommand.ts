import type { ApplyBillingPlanCommand } from "../../commands/applyBillingPlan/types/applyBillingPlanCommand.js";
import type { ConfirmExpiredLockCommand } from "../../commands/confirmExpiredLock/types/confirmExpiredLockCommand.js";
import type { DeleteBalanceCommand } from "../../commands/deleteBalance/types/deleteBalanceCommand.js";
import type { FinalizeCommand } from "../../commands/finalize/types/finalizeCommand.js";
import type { InitializeCommand } from "../../commands/initialize/types/initializeCommand.js";
import type { RecalculateBalanceCommand } from "../../commands/recalculateBalance/types/recalculateBalanceCommand.js";
import type { ResetCommand } from "../../commands/reset/types/resetCommand.js";
import type { TrackCommand } from "../../commands/track/types/trackCommand.js";
import type { UpdateBalanceCommand } from "../../commands/updateBalance/types/updateBalanceCommand.js";

/** A command that appends a mutation to the subject's log. */
export type MutatingCommand =
	| TrackCommand
	| InitializeCommand
	| FinalizeCommand
	| ConfirmExpiredLockCommand
	| ResetCommand
	| ApplyBillingPlanCommand
	| UpdateBalanceCommand
	| DeleteBalanceCommand
	| RecalculateBalanceCommand;
