import type { InitializeCommand } from "../../commands/initialize/types/initializeCommand.js";
import type { TrackCommand } from "../../commands/track/types/trackCommand.js";

/** A command that appends a mutation to the subject's log. */
export type MutatingCommand = TrackCommand | InitializeCommand;
