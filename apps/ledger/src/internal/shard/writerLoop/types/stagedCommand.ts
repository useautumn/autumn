import type { QueuedCommand } from "../../commandQueue/types/queuedCommand.js";
import type { CommandOutcome } from "../../types/commandOutcome.js";

// A command that ran inside the open transaction and still owes its caller a reply.
export type StagedCommand = CommandOutcome & { item: QueuedCommand };
